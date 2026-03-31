const { performance } = require('node:perf_hooks');

const { env } = require('../../config/env');
const { publishHotStreamEvent } = require('../services/stream-events.service');
const { appendAssistantMessageEvent } = require('../services/transcript-write.service');
const { resolveEffectiveLlmSelectionForRun } = require('../services/llm-config.service');
const { logPerformance, measureAsync, startTimer } = require('../services/performance-log.service');
const { getProviderAdapter, getProviderCapabilities } = require('./provider-registry');
const { applyHygiene } = require('./transcript-hygiene.adapter');
const { toProviderTools } = require('./tool-schema.adapter');
const {
  createDisplayPhaseParser
} = require('./output-normalization.adapter');
const { getStopDecision } = require('./stop-conditions');
const { assemblePrompt } = require('./prompt-assembly');
const { listToolDefinitions, executeToolCall } = require('../trainer-tools/tool-registry');
const { appendRawLlmPayload } = require('../services/raw-llm-io-log.service');

function buildMaxIterationFallback(iteration) {
  return [
    `I hit my current internal step limit after ${iteration} iterations.`,
    'I can still help, but I need to stop here for this run.',
    'Please try again or ask a more specific follow-up and I will continue from there.'
  ].join(' ');
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

function hasCommentaryText(events) {
  return Boolean((events || []).some(event => (
    event
    && event.phase === 'commentary'
    && String(event.text || '').trim().length > 0
  )));
}

function ensureTrailingSentencePunctuation(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildCommentaryFallbackLine(toolCall) {
  const toolName = String(toolCall && toolCall.name || '').trim();
  const input = toolCall && toolCall.input && typeof toolCall.input === 'object'
    ? toolCall.input
    : {};

  if (toolName === 'memory_search') {
    return 'Checking what you already have saved';
  }

  if (toolName === 'workout_history_fetch') {
    return 'Checking your recent workout history';
  }

  if (toolName === 'workout_generate') {
    return 'Putting together your next workout';
  }

  if (toolName === 'workout_session_control') {
    if (input.action === 'start') {
      return 'Getting your workout started';
    }

    if (input.action === 'pause') {
      return 'Pausing your workout';
    }

    if (input.action === 'resume') {
      return 'Getting you back into your workout';
    }

    return 'Updating your workout session';
  }

  if (toolName === 'workout_rewrite_remaining') {
    return 'Adjusting the rest of your workout';
  }

  if (toolName === 'workout_replace_exercise') {
    return 'Swapping in a better exercise option';
  }

  if (toolName === 'workout_adjust_set_targets') {
    return 'Adjusting your set targets';
  }

  if (toolName === 'workout_record_set_result') {
    return 'Recording that set and updating what is next';
  }

  if (toolName === 'workout_skip_exercise') {
    return 'Skipping that movement and moving you to the next one';
  }

  if (toolName === 'workout_finish_session') {
    return 'Wrapping up this workout';
  }

  if (toolName === 'document_replace_text' || toolName === 'document_replace_entire') {
    if (input.doc_key === 'MEMORY') {
      return 'Saving that to your memory';
    }

    if (input.doc_key === 'PROGRAM') {
      return 'Updating your training plan';
    }

    if (input.doc_key === 'COACH_SOUL') {
      return 'Updating how I coach you';
    }

    return 'Saving that for later';
  }

  if (toolName === 'episodic_note_append') {
    return 'Saving a note so I keep the context';
  }

  return 'Working through the details before I answer';
}

function buildFallbackCommentaryEvent(toolCall, options = {}) {
  const line = ensureTrailingSentencePunctuation(buildCommentaryFallbackLine(toolCall));

  if (!line) {
    return null;
  }

  return {
    kind: 'delta',
    phase: 'commentary',
    text: `${options.hasPriorCommentary ? '\n' : ''}• ${line}`
  };
}

function shouldFlushAssistantDeltaBuffer(text) {
  const normalized = String(text || '');

  if (!normalized) {
    return false;
  }

  return normalized.length >= env.assistantDeltaFlushChars
    || normalized.includes('\n')
    || /[.!?]\s*$/.test(normalized);
}

function shouldPersistVerboseProviderEvent(normalizedEvent) {
  if (!env.verboseLlmStreamEventsEnabled) {
    return false;
  }

  return Boolean(normalizedEvent && normalizedEvent.type);
}

function createDisplayPhaseStreamEmitter({ iteration, appendEvent }) {
  const pendingDeltaTextByPhase = new Map();
  const emittedInitialDeltaByPhase = new Set();

  async function appendPhaseEvent({ phase, kind, text }) {
    await appendEvent({
      eventType: `assistant.${phase}.${kind}`,
      payload: {
        iteration,
        phase,
        text
      }
    });
  }

  async function flushPendingDelta(phase) {
    const pendingText = pendingDeltaTextByPhase.get(phase) || '';

    if (!pendingText) {
      return;
    }

    pendingDeltaTextByPhase.delete(phase);
    await appendPhaseEvent({
      phase,
      kind: 'delta',
      text: pendingText
    });
  }

  return {
    async append(events) {
      for (const event of events || []) {
        if (!event || !event.phase || !event.kind) {
          continue;
        }

        if (event.kind === 'delta') {
          const text = String(event.text || '');

          if (!text) {
            continue;
          }

          if (!emittedInitialDeltaByPhase.has(event.phase)) {
            emittedInitialDeltaByPhase.add(event.phase);
            await appendPhaseEvent({
              phase: event.phase,
              kind: 'delta',
              text
            });
            continue;
          }

          const nextPendingText = `${pendingDeltaTextByPhase.get(event.phase) || ''}${text}`;

          if (!shouldFlushAssistantDeltaBuffer(nextPendingText)) {
            pendingDeltaTextByPhase.set(event.phase, nextPendingText);
            continue;
          }

          pendingDeltaTextByPhase.delete(event.phase);
          await appendPhaseEvent({
            phase: event.phase,
            kind: 'delta',
            text: nextPendingText
          });
          continue;
        }

        await flushPendingDelta(event.phase);
        await appendPhaseEvent({
          phase: event.phase,
          kind: event.kind,
          text: event.text || ''
        });
      }
    },
    async flush() {
      for (const phase of [...pendingDeltaTextByPhase.keys()]) {
        await flushPendingDelta(phase);
      }
    }
  };
}

async function appendDisplayPhaseStreamEvents({ iteration, events, appendEvent }) {
  const emitter = createDisplayPhaseStreamEmitter({
    iteration,
    appendEvent
  });

  await emitter.append(events);
  await emitter.flush();
}

async function runAgentTurn(run, options = {}) {
  const llmSelection = options.llm || resolveEffectiveLlmSelectionForRun(run);
  const provider = llmSelection.provider;
  const model = llmSelection.model;
  const adapter = getProviderAdapter(provider);
  const caps = getProviderCapabilities(provider, model);
  const maxIterations = env.agentMaxIterations;
  const toolDefinitions = listToolDefinitions();
  const streamEmitMetrics = {
    count: 0,
    durationMs: 0
  };
  const emitStreamEvent = async ({ eventType, payload }) => {
    const startedAt = performance.now();

    try {
      return await publishHotStreamEvent({
        runId: run.run_id,
        eventType,
        payload
      });
    } finally {
      streamEmitMetrics.count += 1;
      streamEmitMetrics.durationMs += performance.now() - startedAt;
    }
  };
  const promptAssembly = await measureAsync({
    stage: 'prompt_assembly',
    runId: run.run_id,
    userId: run.user_id
  }, async () => assemblePrompt(run, {
    messageLimit: env.agentPromptMessageLimit,
    provider
  }), (error, result) => ({
    cacheHit: result ? result.metadata.cacheHit : undefined,
    hasCurrentWorkout: result ? result.metadata.layers.hasCurrentWorkout : undefined
  }));
  let workingMessages = [...promptAssembly.messages];
  let providerState = null;

  try {
    await emitStreamEvent({
      eventType: 'agent.loop.started',
      payload: {
        provider,
        model,
        maxIterations,
        toolsAvailable: toolDefinitions.map(tool => tool.name),
        promptLayers: promptAssembly.metadata.layers
      }
    });

    let hasVisibleCommentary = false;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const hydratedMessages = applyHygiene(workingMessages, {
        maxMessages: env.agentPromptMessageLimit,
        provider
      });
      const providerTools = toProviderTools(toolDefinitions, caps, {
        enablePromptCaching: provider === 'anthropic' && env.anthropicPromptCachingEnabled,
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
        providerState,
        maxOutputTokens: env.agentMaxOutputTokens,
        // We inject per-request runtime context into the system prompt, including
        // the current timestamp. Anthropic automatic caching hashes the full
        // tools+system+messages prefix, so conversation-level auto caching would
        // miss every turn and just create fresh cache writes.
        cacheControl: null,
        promptCacheKey: provider === 'xai' && env.xaiPromptCachingEnabled
          ? `session:${run.session_id}`
          : null,
        toolChoice: providerTools.length > 0
          ? 'auto'
          : undefined,
        parallelToolCalls: false
      };

      adapter.validateCapabilities(runtimeInput, caps);

      await emitStreamEvent({
        eventType: 'agent.iteration.started',
        payload: {
          iteration,
          messageCount: hydratedMessages.length
        }
      });

      await emitStreamEvent({
        eventType: 'llm.request.started',
        payload: {
          provider,
          model,
          iteration,
          cacheHit: promptAssembly.metadata.cacheHit,
          sourceEventIds: promptAssembly.metadata.sourceEventIds
        }
      });

      let finishProviderTotal = null;
      let finishProviderTtfb = null;
      let providerTtfbLogged = false;

      try {
        const finishBuild = startTimer({
          stage: 'provider_request_build',
          runId: run.run_id,
          userId: run.user_id,
          iteration,
          provider,
          model
        });
        let providerRequest;

        try {
          providerRequest = adapter.buildRequest(runtimeInput);
          finishBuild({
            outcome: 'ok'
          });
        } catch (error) {
          finishBuild({
            outcome: 'error',
            errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
          });
          throw error;
        }
        if (
          providerState
          && Array.isArray(providerState.pendingInputItems)
          && providerState.pendingInputItems.length > 0
        ) {
          providerState = {
            ...providerState,
            pendingInputItems: []
          };
        }
        await appendRawLlmPayload({
          phase: 'REQUEST',
          runId: run.run_id,
          iteration,
          payload: providerRequest
        });
        finishProviderTotal = startTimer({
          stage: 'provider_total',
          runId: run.run_id,
          userId: run.user_id,
          iteration,
          provider,
          model
        });
        finishProviderTtfb = startTimer({
          stage: 'provider_ttfb',
          runId: run.run_id,
          userId: run.user_id,
          iteration,
          provider,
          model
        });
        const stream = adapter.createStream(providerRequest);
        const displayPhaseParser = createDisplayPhaseParser();
        const displayPhaseEmitter = createDisplayPhaseStreamEmitter({
          iteration,
          appendEvent: emitStreamEvent
        });
        let textBuffer = '';
        let hasVisibleCommentaryThisIteration = false;

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

          if (!providerTtfbLogged) {
            finishProviderTtfb({
              outcome: 'ok',
              eventType: normalizedEvent.type
            });
            providerTtfbLogged = true;
          }

          if (normalizedEvent.type === 'text_delta') {
            textBuffer += normalizedEvent.payload.text;
          }

          if (shouldPersistVerboseProviderEvent(normalizedEvent)) {
            await emitStreamEvent({
              eventType: `llm.${normalizedEvent.type}`,
              payload: {
                iteration,
                ...normalizedEvent.payload
              }
            });
          }

          if (normalizedEvent.type === 'text_delta') {
            const displayPhaseEvents = displayPhaseParser.consume(normalizedEvent.payload.text);
            const emittedCommentary = hasCommentaryText(displayPhaseEvents);

            if (emittedCommentary) {
              hasVisibleCommentary = true;
              hasVisibleCommentaryThisIteration = true;
            }

            await displayPhaseEmitter.append(displayPhaseEvents);
          }
        }

        const flushedDisplayPhaseEvents = displayPhaseParser.flush();
        if (hasCommentaryText(flushedDisplayPhaseEvents)) {
          hasVisibleCommentary = true;
          hasVisibleCommentaryThisIteration = true;
        }

        await displayPhaseEmitter.append(flushedDisplayPhaseEvents);
        await displayPhaseEmitter.flush();

        const finalOutput = await adapter.extractFinalOutput(stream, textBuffer);
        await appendRawLlmPayload({
          phase: 'RESPONSE',
          runId: run.run_id,
          iteration,
          payload: finalOutput.rawMessage
        });
        const normalizedOutput = adapter.normalizeOutput(finalOutput);

        if (!providerTtfbLogged) {
          finishProviderTtfb({
            outcome: 'ok',
            eventType: 'stream_completed_without_events'
          });
          providerTtfbLogged = true;
        }
        finishProviderTotal({
          outcome: 'ok',
          stopReason: finalOutput.stopReason,
          toolCallCount: normalizedOutput.toolCalls.length
        });

        await emitStreamEvent({
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
          providerState = null;
          await emitStreamEvent({
            eventType: 'agent.iteration.completed',
            payload: {
              iteration,
              stopReason: 'tool_call_truncated',
              toolCallCount: normalizedOutput.toolCalls.length,
              outputTextLength: normalizedOutput.outputText.length
            }
          });

          await emitStreamEvent({
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

        await emitStreamEvent({
          eventType: 'agent.iteration.completed',
          payload: {
            iteration,
            stopReason: stopDecision.reason,
            toolCallCount: normalizedOutput.toolCalls.length,
            outputTextLength: normalizedOutput.outputText.length
          }
        });

        if (stopDecision.shouldStop && stopDecision.reason === 'final_response') {
          const suppressAssistantReply = shouldSuppressAssistantReply(
            run,
            normalizedOutput.finalText || normalizedOutput.outputText
          );

          if (!suppressAssistantReply) {
            await measureAsync({
              stage: 'assistant_transcript_write',
              runId: run.run_id,
              userId: run.user_id,
              iteration
            }, async () => appendAssistantMessageEvent({
              run,
              text: normalizedOutput.finalText || normalizedOutput.outputText,
              provider,
              model,
              usage: normalizedOutput.usage,
              stopReason: normalizedOutput.stopReason
            }));
          } else {
            await emitStreamEvent({
              eventType: 'assistant.reply.suppressed',
              payload: {
                reason: 'no_reply',
                triggerType: run.trigger_type
              }
            });
          }

          await emitStreamEvent({
            eventType: 'agent.loop.completed',
            payload: {
              provider,
              model,
              iterationsUsed: iteration,
              stopReason: 'final_response'
            }
          });
          return {
            outputText: suppressAssistantReply ? '' : (normalizedOutput.finalText || normalizedOutput.outputText),
            provider,
            model,
            iterationsUsed: iteration
          };
        }

        if (stopDecision.shouldStop && stopDecision.reason === 'max_iterations') {
          const fallbackText = buildMaxIterationFallback(iteration);

          await measureAsync({
            stage: 'assistant_transcript_write',
            runId: run.run_id,
            userId: run.user_id,
            iteration
          }, async () => appendAssistantMessageEvent({
            run,
            text: fallbackText,
            provider,
            model,
            usage: normalizedOutput.usage,
            stopReason: 'max_iterations'
          }));

          await emitStreamEvent({
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

        if (normalizedOutput.assistantMessage) {
          workingMessages.push(normalizedOutput.assistantMessage);
        }

        for (const toolCall of normalizedOutput.toolCalls) {
          if (!hasVisibleCommentaryThisIteration) {
            const fallbackCommentaryEvent = buildFallbackCommentaryEvent(toolCall, {
              hasPriorCommentary: hasVisibleCommentary
            });

            if (fallbackCommentaryEvent) {
              await appendDisplayPhaseStreamEvents({
                iteration,
                events: [fallbackCommentaryEvent],
                appendEvent: emitStreamEvent
              });
              hasVisibleCommentary = true;
              hasVisibleCommentaryThisIteration = true;
            }
          }

          await emitStreamEvent({
            eventType: 'tool.call.requested',
            payload: {
              iteration,
              toolName: toolCall.name,
              toolUseId: toolCall.id,
              input: toolCall.input
            }
          });

          const finishToolCall = startTimer({
            stage: 'tool_call',
            runId: run.run_id,
            userId: run.user_id,
            iteration,
            toolName: toolCall.name
          });
          let toolResult;

          try {
            toolResult = await executeToolCall({
              toolName: toolCall.name,
              input: toolCall.input,
              run
            });
            finishToolCall({
              outcome: 'ok',
              resultStatus: toolResult.status
            });
          } catch (error) {
            finishToolCall({
              outcome: 'error',
              errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
            });
            throw error;
          }

          await emitStreamEvent({
            eventType: 'tool.call.completed',
            payload: {
              iteration,
              toolName: toolCall.name,
              toolUseId: toolCall.id,
              resultStatus: toolResult.status,
              outputPreview: JSON.stringify(toolResult).slice(0, 500)
            }
          });

          if (
            toolResult &&
            toolResult.status === 'ok' &&
            toolResult.output &&
            toolResult.output.workout
          ) {
            await emitStreamEvent({
              eventType: 'workout.state.updated',
              payload: {
                iteration,
                toolName: toolCall.name,
                workout: toolResult.output.workout,
                appliedStateVersion: toolResult.output.workout.stateVersion || null
              }
            });
          }

          const toolResultMessage = adapter.buildToolResultMessage(toolCall, toolResult);

          if (toolResultMessage) {
            workingMessages.push(toolResultMessage);
          }

          providerState = adapter.accumulateToolResultState({
            currentState: providerState,
            finalOutput,
            toolCall,
            toolResult
          });
        }
      } catch (error) {
        if (finishProviderTtfb && !providerTtfbLogged) {
          finishProviderTtfb({
            outcome: 'error',
            errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
          });
          providerTtfbLogged = true;
        }

        if (finishProviderTotal) {
          finishProviderTotal({
            outcome: 'error',
            errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
          });
        }

        const errorClass = adapter.classifyError(error);

        await emitStreamEvent({
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
  } finally {
    logPerformance({
      stage: 'stream_emit_summary',
      runId: run.run_id,
      userId: run.user_id,
      eventCount: streamEmitMetrics.count,
      durationMs: Math.round(streamEmitMetrics.durationMs * 1000) / 1000
    });
  }

  throw new Error('Agent loop exited without producing a terminal response');
}

module.exports = {
  runAgentTurn
};
