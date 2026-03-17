const { env } = require('../../config/env');
const { appendStreamEvent } = require('../services/stream-events.service');
const { appendAssistantMessageEvent } = require('../services/transcript-write.service');
const { getPromptContextForRun } = require('../services/prompt-context-cache.service');
const { getProviderAdapter, getProviderCapabilities } = require('./provider-registry');

function buildSystemPrompt() {
  return [
    'You are an AI personal trainer.',
    'Be concise, warm, and practical.',
    'For this first runtime slice, respond with plain helpful coaching text.',
    'Do not call tools yet.',
    'Keep responses short and action-oriented.'
  ].join(' ');
}

async function runAgentTurn(run) {
  const provider = env.defaultLlmProvider;
  const model = env.defaultAnthropicModel;
  const promptContext = await getPromptContextForRun(run, {
    messageLimit: 12
  });

  const runtimeInput = {
    provider,
    model,
    userId: run.user_id,
    systemPrompt: buildSystemPrompt(),
    messages: promptContext.messages,
    tools: [],
    maxOutputTokens: 800
  };

  const adapter = getProviderAdapter(provider);
  const caps = getProviderCapabilities(provider, model);
  adapter.validateCapabilities(runtimeInput, caps);

  const providerRequest = adapter.buildRequest(runtimeInput);
  const stream = adapter.createStream(providerRequest);
  let textBuffer = '';

  await appendStreamEvent({
    runId: run.run_id,
    eventType: 'llm.request.started',
    payload: {
      provider,
      model,
      cacheHit: promptContext.cacheHit,
      sourceEventIds: promptContext.sourceEventIds
    }
  });

  try {
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
        payload: normalizedEvent.payload
      });
    }

    const finalOutput = await adapter.extractFinalOutput(stream, textBuffer);

    await appendAssistantMessageEvent({
      run,
      text: finalOutput.outputText,
      provider,
      model,
      usage: finalOutput.usage,
      stopReason: finalOutput.stopReason
    });

    await appendStreamEvent({
      runId: run.run_id,
      eventType: 'llm.request.completed',
      payload: {
        provider,
        model,
        stopReason: finalOutput.stopReason,
        usage: finalOutput.usage || {}
      }
    });

    return {
      outputText: finalOutput.outputText,
      provider,
      model
    };
  } catch (error) {
    const errorClass = adapter.classifyError(error);

    await appendStreamEvent({
      runId: run.run_id,
      eventType: 'llm.request.failed',
      payload: {
        provider,
        model,
        errorClass,
        message: error.message
      }
    });

    error.errorClass = errorClass;
    throw error;
  }
}

module.exports = {
  runAgentTurn
};
