const { env } = require('../../config/env');
const { appendStreamEvent } = require('../services/stream-events.service');
const { appendAssistantMessageEvent } = require('../services/transcript-write.service');
const { getProviderAdapter, getProviderCapabilities } = require('./provider-registry');
const { applyHygiene } = require('./transcript-hygiene.adapter');
const { toProviderTools } = require('./tool-schema.adapter');
const { normalizeAnthropicOutput, buildToolResultMessage } = require('./output-normalization.adapter');
const { getStopDecision } = require('./stop-conditions');
const { assemblePrompt } = require('./prompt-assembly');
const { listToolDefinitions, executeToolCall } = require('../trainer-tools/tool-registry');

function buildMaxIterationFallback(iteration) {
  return [
    `I hit my current internal step limit after ${iteration} iterations.`,
    'I can still help, but I need to stop here for this run.',
    'Please try again or ask a more specific follow-up and I will continue from there.'
  ].join(' ');
}

function prettyPrintRawPayload(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return JSON.stringify({
      serializationError: error.message,
      preview: String(payload)
    }, null, 2);
  }
}

function logRawLlmPayload({ phase, runId, iteration, payload }) {
  if (!env.llmRawIoLoggingEnabled) {
    return;
  }

  const suffix = [`run=${runId}`, iteration ? `iteration=${iteration}` : null]
    .filter(Boolean)
    .join(' ');

  console.log(`[LLM RAW ${phase}${suffix ? ` ${suffix}` : ''}]`);
  console.log(prettyPrintRawPayload(payload));
}

function maybeLogAnthropicContentBlock({ runId, iteration, providerEvent }) {
  if (!env.llmRawIoLoggingEnabled || !providerEvent || !providerEvent.type) {
    return;
  }

  if (
    providerEvent.type === 'content_block_start'
    || providerEvent.type === 'content_block_stop'
    || (
      providerEvent.type === 'content_block_delta'
      && providerEvent.delta
      && providerEvent.delta.type === 'input_json_delta'
    )
  ) {
    logRawLlmPayload({
      phase: 'CONTENT BLOCK',
      runId,
      iteration,
      payload: providerEvent
    });
  }
}

function maybeLogFinalMessageContent({ runId, iteration, rawMessage }) {
  if (!env.llmRawIoLoggingEnabled || !rawMessage || !Array.isArray(rawMessage.content)) {
    return;
  }

  logRawLlmPayload({
    phase: 'FINAL CONTENT',
    runId,
    iteration,
    payload: rawMessage.content
  });
}

function shouldRetryTruncatedToolCall(finalOutput, normalizedOutput) {
  return finalOutput.stopReason === 'max_tokens' && normalizedOutput.toolCalls.length > 0;
}

function buildTruncatedToolRetryMessage(toolCalls) {
  const toolNames = [...new Set(
    (toolCalls || [])
      .map(toolCall => toolCall.name)
      .filter(Boolean)
  )];
  const toolList = toolNames.length > 0 ? toolNames.join(', ') : 'the previous tool';

  return [
    `Your previous response was cut off by the output token limit while generating input for ${toolList}.`,
    'Do not assume the tool executed.',
    'Retry the tool call with a complete input object.',
    'Do not include any explanatory prose before or after the tool call.',
    'For document writes, include the full markdown and use the current version from context or a read tool instead of guessing.'
  ].join(' ');
}

function shouldSuppressAssistantReply(run, outputText) {
  return run.trigger_type === 'ui.action.complete_set'
    && String(outputText || '').trim().toLowerCase() === 'no_reply';
}

async function runAgentTurn(run) {
  const provider = env.defaultLlmProvider;
  const model = env.defaultAnthropicModel;
  const adapter = getProviderAdapter(provider);
  const caps = getProviderCapabilities(provider, model);
  const maxIterations = env.agentMaxIterations;
  const toolDefinitions = listToolDefinitions();
  const promptAssembly = await assemblePrompt(run, {
    messageLimit: env.agentPromptMessageLimit
  });
  let workingMessages = [...promptAssembly.messages];

  await appendStreamEvent({
    runId: run.run_id,
    eventType: 'agent.loop.started',
    payload: {
      provider,
      model,
      maxIterations,
      toolsAvailable: toolDefinitions.map(tool => tool.name),
      promptLayers: promptAssembly.metadata.layers
    }
  });

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const hydratedMessages = applyHygiene(workingMessages, {
      maxMessages: env.agentPromptMessageLimit,
      provider
    });
    const providerTools = toProviderTools(toolDefinitions, caps, {
      enablePromptCaching: env.anthropicPromptCachingEnabled,
      staticCacheTtl: env.anthropicStaticCacheTtl
    });
    const runtimeInput = {
      provider,
      model,
      userId: run.user_id,
      systemPrompt: promptAssembly.systemPrompt,
      systemPromptBlocks: promptAssembly.systemBlocks,
      messages: hydratedMessages,
      tools: providerTools,
      maxOutputTokens: env.agentMaxOutputTokens,
      cacheControl: env.anthropicPromptCachingEnabled
        ? {
            type: 'ephemeral',
            ttl: env.anthropicConversationCacheTtl
          }
        : null,
      toolChoice: providerTools.length > 0
        ? {
            type: 'auto',
            disable_parallel_tool_use: true
          }
        : undefined
    };

    adapter.validateCapabilities(runtimeInput, caps);

    await appendStreamEvent({
      runId: run.run_id,
      eventType: 'agent.iteration.started',
      payload: {
        iteration,
        messageCount: hydratedMessages.length
      }
    });

    await appendStreamEvent({
      runId: run.run_id,
      eventType: 'llm.request.started',
      payload: {
        provider,
        model,
        iteration,
        cacheHit: promptAssembly.metadata.cacheHit,
        sourceEventIds: promptAssembly.metadata.sourceEventIds
      }
    });

    try {
      const providerRequest = adapter.buildRequest(runtimeInput);
      const stream = adapter.createStream(providerRequest);
      let textBuffer = '';

      // Anthropic's MessageStream will surface some request validation failures
      // as unhandled rejections unless an error listener or promise consumer exists.
      if (stream && typeof stream.on === 'function') {
        stream.on('error', () => {});
      }

      for await (const providerEvent of stream) {
        const normalizedEvent = adapter.normalizeStreamEvent(providerEvent);

        if (!normalizedEvent) {
          continue;
        }

        if (normalizedEvent.type === 'text_delta') {
          textBuffer += normalizedEvent.payload.text;
        }

        await appendStreamEvent({
          runId: run.run_id,
          eventType: `llm.${normalizedEvent.type}`,
          payload: {
            iteration,
            ...normalizedEvent.payload
          }
        });
      }

      const finalOutput = await adapter.extractFinalOutput(stream, textBuffer);
      logRawLlmPayload({
        phase: 'FINAL MESSAGE',
        runId: run.run_id,
        iteration,
        payload: finalOutput.rawMessage
      });
      maybeLogFinalMessageContent({
        runId: run.run_id,
        iteration,
        rawMessage: finalOutput.rawMessage
      });
      const normalizedOutput = normalizeAnthropicOutput(finalOutput);

      await appendStreamEvent({
        runId: run.run_id,
        eventType: 'llm.request.completed',
        payload: {
          provider,
          model,
          iteration,
          stopReason: finalOutput.stopReason,
          usage: finalOutput.usage || {},
          toolCallCount: normalizedOutput.toolCalls.length
        }
      });

      if (shouldRetryTruncatedToolCall(finalOutput, normalizedOutput)) {
        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'agent.iteration.completed',
          payload: {
            iteration,
            stopReason: 'tool_call_truncated',
            toolCallCount: normalizedOutput.toolCalls.length,
            outputTextLength: normalizedOutput.outputText.length
          }
        });

        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'tool.call.skipped',
          payload: {
            iteration,
            reason: 'provider_max_tokens',
            toolNames: normalizedOutput.toolCalls.map(toolCall => toolCall.name)
          }
        });

        workingMessages.push({
          role: 'user',
          content: buildTruncatedToolRetryMessage(normalizedOutput.toolCalls)
        });
        continue;
      }

      const stopDecision = getStopDecision({
        iteration,
        maxIterations,
        normalizedOutput
      });

      await appendStreamEvent({
        runId: run.run_id,
        eventType: 'agent.iteration.completed',
        payload: {
          iteration,
          stopReason: stopDecision.reason,
          toolCallCount: normalizedOutput.toolCalls.length,
          outputTextLength: normalizedOutput.outputText.length
        }
      });

      if (stopDecision.shouldStop && stopDecision.reason === 'final_response') {
        const suppressAssistantReply = shouldSuppressAssistantReply(run, normalizedOutput.outputText);

        if (!suppressAssistantReply) {
          await appendAssistantMessageEvent({
            run,
            text: normalizedOutput.outputText,
            provider,
            model,
            usage: normalizedOutput.usage,
            stopReason: normalizedOutput.stopReason
          });
        } else {
          await appendStreamEvent({
            runId: run.run_id,
            eventType: 'assistant.reply.suppressed',
            payload: {
              reason: 'no_reply',
              triggerType: run.trigger_type
            }
          });
        }

        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'agent.loop.completed',
          payload: {
            provider,
            model,
            iterationsUsed: iteration,
            stopReason: 'final_response'
          }
        });

        return {
          outputText: suppressAssistantReply ? '' : normalizedOutput.outputText,
          provider,
          model,
          iterationsUsed: iteration
        };
      }

      if (stopDecision.shouldStop && stopDecision.reason === 'max_iterations') {
        const fallbackText = buildMaxIterationFallback(iteration);

        await appendAssistantMessageEvent({
          run,
          text: fallbackText,
          provider,
          model,
          usage: normalizedOutput.usage,
          stopReason: 'max_iterations'
        });

        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'agent.loop.completed',
          payload: {
            provider,
            model,
            iterationsUsed: iteration,
            stopReason: 'max_iterations'
          }
        });

        return {
          outputText: fallbackText,
          provider,
          model,
          iterationsUsed: iteration
        };
      }

      workingMessages.push(normalizedOutput.assistantMessage);

      for (const toolCall of normalizedOutput.toolCalls) {
        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'tool.call.requested',
          payload: {
            iteration,
            toolName: toolCall.name,
            toolUseId: toolCall.id,
            input: toolCall.input
          }
        });

        const toolResult = await executeToolCall({
          toolName: toolCall.name,
          input: toolCall.input,
          run
        });

        await appendStreamEvent({
          runId: run.run_id,
          eventType: 'tool.call.completed',
          payload: {
            iteration,
            toolName: toolCall.name,
            toolUseId: toolCall.id,
            resultStatus: toolResult.status,
            outputPreview: JSON.stringify(toolResult).slice(0, 500)
          }
        });

        workingMessages.push(buildToolResultMessage(toolCall, toolResult));
      }
    } catch (error) {
      const errorClass = adapter.classifyError(error);

      await appendStreamEvent({
        runId: run.run_id,
        eventType: 'llm.request.failed',
        payload: {
          provider,
          model,
          iteration,
          errorClass,
          message: error.message
        }
      });

      error.errorClass = errorClass;
      throw error;
    }
  }

  throw new Error('Agent loop exited without producing a terminal response');
}

module.exports = {
  runAgentTurn
};
