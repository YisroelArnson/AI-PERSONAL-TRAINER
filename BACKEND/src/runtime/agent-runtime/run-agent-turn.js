/**
 * File overview:
 * Supports the agent runtime flow for run agent turn.
 *
 * Main functions in this file:
 * - shouldRetryTruncatedToolCall: Handles Should retry truncated tool call for run-agent-turn.js.
 * - buildTruncatedToolRetryMessage: Builds a Truncated tool retry message used by this file.
 * - buildToolOnlyRetryMessage: Builds a Tool only retry message used by this file.
 * - validateOutputContract: Validates Output contract before it is used.
 * - inspectToolBatch: Handles Inspect tool batch for run-agent-turn.js.
 * - buildToolBatchRetryMessage: Builds a Tool batch retry message used by this file.
 * - requiresDurableUserReply: Handles Requires durable user reply for run-agent-turn.js.
 * - buildDurableReplyRetryMessage: Builds a Durable reply retry message used by this file.
 * - shouldPersistVerboseProviderEvent: Handles Should persist verbose provider event for run-agent-turn.js.
 * - extractMessageToolPayload: Handles Extract message tool payload for run-agent-turn.js.
 * - resolveStreamingToolBehavior: Resolves Streaming tool behavior before the next step runs.
 * - decodePartialJsonString: Decodes Partial JSON string from the transport format.
 * - extractPartialJsonStringProperty: Handles Extract partial JSON string property for run-agent-turn.js.
 * - safeParseJsonObject: Handles Safe parse JSON object for run-agent-turn.js.
 * - upsertStreamingToolState: Handles Upsert streaming tool state for run-agent-turn.js.
 * - ensureStreamingToolStateForToolCall: Ensures Streaming tool state for tool call is ready before work continues.
 * - findStreamingToolStateByToolUseId: Handles Find streaming tool state by tool use ID for run-agent-turn.js.
 * - extractStreamingMessageToolPayload: Handles Extract streaming message tool payload for run-agent-turn.js.
 * - trimStreamingTextToStableBoundary: Trims Streaming text to stable boundary to the supported shape.
 * - findStreamingWordBatch: Handles Find streaming word batch for run-agent-turn.js.
 * - emitStreamingAssistantDeltaChunks: Handles Emit streaming assistant delta chunks for run-agent-turn.js.
 * - emitEarlyStreamingToolEvents: Handles Emit early streaming tool events for run-agent-turn.js.
 * - runAgentTurn: Handles Run agent turn for run-agent-turn.js.
 * - emitStreamEvent: Handles Emit stream event for run-agent-turn.js.
 */

const { performance } = require('node:perf_hooks');

const { env } = require('../../config/env');
const { publishHotStreamEvent } = require('../services/stream-events.service');
const { resolveEffectiveLlmSelectionForRun } = require('../services/llm-config.service');
const { logPerformance, measureAsync, startTimer } = require('../services/performance-log.service');
const { getProviderAdapter, getProviderCapabilities } = require('./provider-registry');
const { applyHygiene } = require('./transcript-hygiene.adapter');
const { toProviderTools } = require('./tool-schema.adapter');
const { normalizeVisibleText } = require('./output-normalization.adapter');
const { assemblePrompt } = require('./prompt-assembly');
const { NORMALIZED_STREAM_EVENT_TYPES } = require('./types');
const {
  listToolDefinitions,
  resolveToolCallBehavior,
  executeToolCall
} = require('../trainer-tools/tool-registry');
const { appendRawLlmPayload } = require('../services/raw-llm-io-log.service');
const { appendToolObservationEvent } = require('../services/tool-observation.service');

const STREAM_TEXT_CHUNK_WORDS = 5;

/**
 * Handles Should retry truncated tool call for run-agent-turn.js.
 */
function shouldRetryTruncatedToolCall(finalOutput, normalizedOutput) {
  return finalOutput.stopReason === 'max_tokens' && normalizedOutput.toolCalls.length > 0;
}

/**
 * Builds a Truncated tool retry message used by this file.
 */
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
    'Retry with native tool calls only and provide complete arguments.',
    'Do not include any plain text before or after the tool call.',
    'For document writes, include the full markdown and use the current version from context or a read tool instead of guessing.'
  ].join(' ');
}

/**
 * Builds a Tool only retry message used by this file.
 */
function buildToolOnlyRetryMessage(reason, normalizedOutput) {
  if (reason === 'missing_tool_call') {
    return [
      'Your previous response did not include any native tool call.',
      'Every turn must contain at least one tool call.',
      'Use message_notify_user, message_ask_user, or idle when you need to communicate or terminate.',
      'Do not return plain text outside native tool calls.'
    ].join(' ');
  }

  const preview = normalizeVisibleText(normalizedOutput && normalizedOutput.rawText || '');
  const clippedPreview = preview ? ` Offending text: "${preview.slice(0, 280)}".` : '';

  return [
    'Your previous response included plain text outside native tool calls.',
    'Plain text responses are forbidden in this runtime.',
    'Communicate with the user only through message_notify_user or message_ask_user, and use idle for silent completion.',
    `Retry with tool calls only.${clippedPreview}`
  ].join(' ');
}

/**
 * Validates Output contract before it is used.
 */
function validateOutputContract(normalizedOutput) {
  if (!normalizedOutput || normalizedOutput.toolCalls.length === 0) {
    return {
      valid: false,
      reason: 'missing_tool_call'
    };
  }

  if (normalizeVisibleText(normalizedOutput.rawText)) {
    return {
      valid: false,
      reason: 'plain_text_not_allowed'
    };
  }

  return {
    valid: true,
    reason: null
  };
}

/**
 * Handles Inspect tool batch for run-agent-turn.js.
 */
function inspectToolBatch(toolCalls) {
  const resolvedCalls = (toolCalls || []).map(toolCall => ({
    toolCall,
    behavior: resolveToolCallBehavior({
      toolName: toolCall.name,
      input: toolCall.input
    })
  }));
  const terminalCalls = resolvedCalls.filter(entry => entry.behavior.terminal);

  if (terminalCalls.length === 0) {
    return {
      valid: true,
      terminalToolCall: null,
      reason: null
    };
  }

  if (terminalCalls.length > 1) {
    return {
      valid: false,
      terminalToolCall: null,
      reason: 'multiple_terminal_tools',
      toolNames: terminalCalls.map(entry => entry.toolCall.name)
    };
  }

  if (resolvedCalls.length > 1) {
    return {
      valid: false,
      terminalToolCall: null,
      reason: 'mixed_terminal_and_nonterminal_tools',
      toolNames: resolvedCalls.map(entry => entry.toolCall.name)
    };
  }

  return {
    valid: true,
    terminalToolCall: terminalCalls[0].toolCall,
    reason: 'terminal_tool_requested'
  };
}

/**
 * Builds a Tool batch retry message used by this file.
 */
function buildToolBatchRetryMessage(validation) {
  const toolList = Array.isArray(validation && validation.toolNames) && validation.toolNames.length > 0
    ? validation.toolNames.join(', ')
    : 'the previous tools';

  if (validation && validation.reason === 'multiple_terminal_tools') {
    return [
      `Your previous response requested multiple terminal tools in one turn: ${toolList}.`,
      'A response may end with at most one terminal tool.',
      'Retry with exactly one terminal tool call and no other tool calls.'
    ].join(' ');
  }

  return [
    `Your previous response mixed a terminal tool with non-terminal tools: ${toolList}.`,
    'Terminal tools must be the only tool call in their response.',
    'Retry with either only non-terminal tools, or exactly one terminal tool call.'
  ].join(' ');
}

/**
 * Handles Requires durable user reply for run-agent-turn.js.
 */
function requiresDurableUserReply(triggerType) {
  const normalized = String(triggerType || '').trim().toLowerCase();
  return normalized === 'user.message' || normalized === 'app.opened';
}

/**
 * Builds a Durable reply retry message used by this file.
 */
function buildDurableReplyRetryMessage(triggerType) {
  const normalized = String(triggerType || '').trim().toLowerCase();
  const triggerLabel = normalized || 'this turn';

  return [
    `You ended ${triggerLabel} without a durable user-facing reply.`,
    'For direct user-visible turns, do not finish with idle after only transient updates.',
    'Retry with exactly one terminal user-facing tool call.',
    'Use message_notify_user with delivery="feed" for a normal reply, or message_ask_user if you genuinely need clarification.'
  ].join(' ');
}

/**
 * Builds provider-specific tool choice for the runtime's tool-only contract.
 */
function buildRuntimeToolChoice({ provider, hasTools, parallelToolCalls }) {
  if (!hasTools) {
    return undefined;
  }

  if (provider === 'anthropic') {
    return {
      type: 'any',
      disable_parallel_tool_use: parallelToolCalls !== true
    };
  }

  return 'auto';
}

/**
 * Handles Should persist verbose provider event for run-agent-turn.js.
 */
function shouldPersistVerboseProviderEvent(normalizedEvent) {
  if (!env.verboseLlmStreamEventsEnabled) {
    return false;
  }

  return Boolean(normalizedEvent && normalizedEvent.type);
}

/**
 * Handles Extract message tool payload for run-agent-turn.js.
 */
function extractMessageToolPayload({ toolName, input, toolResult }) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const safeOutput = toolResult && toolResult.output && typeof toolResult.output === 'object'
    ? toolResult.output
    : {};

  if (safeOutput.skipped || safeOutput.delivery === 'suppressed') {
    return {
      delivery: 'suppressed',
      skipped: true,
      skipReason: safeOutput.skipReason || 'stale_user_turn'
    };
  }

  const text = normalizeVisibleText(safeOutput.text || safeInput.text || '');

  if (!text) {
    return {};
  }

  if (toolName === 'message_notify_user') {
    return {
      text,
      delivery: safeOutput.delivery || safeInput.delivery || 'feed'
    };
  }

  if (toolName === 'message_ask_user') {
    return {
      text,
      delivery: 'feed'
    };
  }

  return {};
}

/**
 * Resolves Streaming tool behavior before the next step runs.
 */
function resolveStreamingToolBehavior({ toolName, input }) {
  const behavior = resolveToolCallBehavior({ toolName, input });

  if (
    toolName === 'message_notify_user'
    && (!input || typeof input.delivery !== 'string' || !input.delivery.trim())
  ) {
    return {
      ...behavior,
      terminal: false
    };
  }

  return behavior;
}

/**
 * Decodes Partial JSON string from the transport format.
 */
function decodePartialJsonString(rawValue, startIndex) {
  let text = '';
  let index = startIndex;

  while (index < rawValue.length) {
    const character = rawValue[index];

    if (character === '"') {
      return {
        value: text,
        complete: true
      };
    }

    if (character !== '\\') {
      text += character;
      index += 1;
      continue;
    }

    if (index + 1 >= rawValue.length) {
      return {
        value: text,
        complete: false
      };
    }

    const escapeCharacter = rawValue[index + 1];

    if (escapeCharacter === 'u') {
      const unicodeDigits = rawValue.slice(index + 2, index + 6);

      if (!/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
        return {
          value: text,
          complete: false
        };
      }

      text += String.fromCharCode(Number.parseInt(unicodeDigits, 16));
      index += 6;
      continue;
    }

    const decodedEscapes = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t'
    };

    if (!(escapeCharacter in decodedEscapes)) {
      return {
        value: text,
        complete: false
      };
    }

    text += decodedEscapes[escapeCharacter];
    index += 2;
  }

  return {
    value: text,
    complete: false
  };
}

/**
 * Handles Extract partial JSON string property for run-agent-turn.js.
 */
function extractPartialJsonStringProperty(rawValue, propertyName) {
  if (!rawValue || typeof rawValue !== 'string') {
    return {
      value: '',
      found: false,
      complete: false
    };
  }

  const propertyToken = `"${propertyName}"`;
  let searchIndex = 0;

  while (searchIndex < rawValue.length) {
    const tokenIndex = rawValue.indexOf(propertyToken, searchIndex);

    if (tokenIndex === -1) {
      break;
    }

    let cursor = tokenIndex + propertyToken.length;

    while (cursor < rawValue.length && /\s/.test(rawValue[cursor])) {
      cursor += 1;
    }

    if (rawValue[cursor] !== ':') {
      searchIndex = tokenIndex + propertyToken.length;
      continue;
    }

    cursor += 1;

    while (cursor < rawValue.length && /\s/.test(rawValue[cursor])) {
      cursor += 1;
    }

    if (cursor >= rawValue.length) {
      return {
        value: '',
        found: true,
        complete: false
      };
    }

    if (rawValue[cursor] !== '"') {
      return {
        value: '',
        found: true,
        complete: false
      };
    }

    const decoded = decodePartialJsonString(rawValue, cursor + 1);

    return {
      value: decoded.value,
      found: true,
      complete: decoded.complete
    };
  }

  return {
    value: '',
    found: false,
    complete: false
  };
}

/**
 * Handles Safe parse JSON object for run-agent-turn.js.
 */
function safeParseJsonObject(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (error) {
    return null;
  }
}

/**
 * Handles Upsert streaming tool state for run-agent-turn.js.
 */
function upsertStreamingToolState(streamingToolStates, normalizedEvent) {
  const payload = normalizedEvent && normalizedEvent.payload && typeof normalizedEvent.payload === 'object'
    ? normalizedEvent.payload
    : {};
  const streamKey = String(payload.streamKey || '').trim();

  if (!streamKey) {
    return null;
  }

  const existing = streamingToolStates.get(streamKey) || {
    streamKey,
    toolUseId: null,
    toolName: null,
    input: {},
    rawInputJson: '',
    requestedEmitted: false,
    emittedTextLength: 0
  };

  if (payload.toolUseId) {
    existing.toolUseId = payload.toolUseId;
  }

  if (payload.toolName) {
    existing.toolName = payload.toolName;
  }

  if (payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)) {
    existing.input = payload.input;
    existing.rawInputJson = JSON.stringify(payload.input);
  }

  if (normalizedEvent.type === NORMALIZED_STREAM_EVENT_TYPES.toolInputDelta) {
    if (typeof payload.snapshot === 'string' && payload.snapshot) {
      existing.rawInputJson = payload.snapshot;
    } else if (typeof payload.partialJson === 'string' && payload.partialJson) {
      existing.rawInputJson += payload.partialJson;
    }

    const parsedInput = safeParseJsonObject(existing.rawInputJson);

    if (parsedInput) {
      existing.input = parsedInput;
    }
  }

  streamingToolStates.set(streamKey, existing);
  return existing;
}

/**
 * Ensures Streaming tool state for tool call is ready before work continues.
 */
function ensureStreamingToolStateForToolCall(streamingToolStates, toolCall) {
  const existing = findStreamingToolStateByToolUseId(streamingToolStates, toolCall.id);

  if (existing) {
    existing.toolName = toolCall.name;
    existing.input = toolCall.input || {};
    existing.rawInputJson = JSON.stringify(toolCall.input || {});
    return existing;
  }

  const toolState = {
    streamKey: `tool_call:${toolCall.id}`,
    toolUseId: toolCall.id,
    toolName: toolCall.name,
    input: toolCall.input || {},
    rawInputJson: JSON.stringify(toolCall.input || {}),
    requestedEmitted: false,
    emittedTextLength: 0
  };

  streamingToolStates.set(toolState.streamKey, toolState);
  return toolState;
}

/**
 * Handles Find streaming tool state by tool use ID for run-agent-turn.js.
 */
function findStreamingToolStateByToolUseId(streamingToolStates, toolUseId) {
  if (!toolUseId) {
    return null;
  }

  for (const toolState of streamingToolStates.values()) {
    if (toolState.toolUseId === toolUseId) {
      return toolState;
    }
  }

  return null;
}

/**
 * Handles Extract streaming message tool payload for run-agent-turn.js.
 */
function extractStreamingMessageToolPayload(toolState) {
  if (!toolState || !toolState.toolName) {
    return {};
  }

  const safeInput = toolState.input && typeof toolState.input === 'object'
    ? toolState.input
    : {};
  const rawInputJson = typeof toolState.rawInputJson === 'string'
    ? toolState.rawInputJson
    : '';
  const partialText = extractPartialJsonStringProperty(rawInputJson, 'text');
  const resolvedText = typeof safeInput.text === 'string'
    ? safeInput.text
    : (partialText.found ? partialText.value : '');

  if (!resolvedText) {
    return {};
  }

  if (toolState.toolName === 'message_ask_user') {
    return {
      text: resolvedText,
      delivery: 'feed',
      textComplete: typeof safeInput.text === 'string' || partialText.complete
    };
  }

  if (toolState.toolName === 'message_notify_user') {
    const partialDelivery = extractPartialJsonStringProperty(rawInputJson, 'delivery');
    const resolvedDelivery = typeof safeInput.delivery === 'string' && safeInput.delivery.trim()
      ? safeInput.delivery.trim().toLowerCase()
      : String(partialDelivery.value || '').trim().toLowerCase();
    const delivery = resolvedDelivery.startsWith('trans')
      ? 'transient'
      : 'feed';

    return {
      text: resolvedText,
      delivery,
      textComplete: typeof safeInput.text === 'string' || partialText.complete
    };
  }

  return {};
}

/**
 * Trims Streaming text to stable boundary to the supported shape.
 */
function trimStreamingTextToStableBoundary(text, textComplete) {
  const rawText = String(text || '');

  if (!rawText) {
    return '';
  }

  if (textComplete) {
    return rawText;
  }

  if (/[\s.!?,;:)\]}>"']$/.test(rawText)) {
    return rawText;
  }

  const lastWhitespaceMatch = [...rawText.matchAll(/\s+/g)].pop();

  if (!lastWhitespaceMatch || !Number.isFinite(lastWhitespaceMatch.index)) {
    return '';
  }

  return rawText.slice(0, lastWhitespaceMatch.index + lastWhitespaceMatch[0].length);
}

/**
 * Handles Find streaming word batch for run-agent-turn.js.
 */
function findStreamingWordBatch(text, startIndex, batchSize) {
  if (!text || startIndex >= text.length) {
    return null;
  }

  const wordPattern = /\S+/g;
  wordPattern.lastIndex = startIndex;

  let boundary = null;
  let wordCount = 0;
  let match = null;

  while ((match = wordPattern.exec(text))) {
    if (match.index < startIndex) {
      continue;
    }

    wordCount += 1;
    boundary = match.index + match[0].length;

    if (wordCount >= batchSize) {
      break;
    }
  }

  if (!boundary) {
    return null;
  }

  while (boundary < text.length && /\s/.test(text[boundary])) {
    boundary += 1;
  }

  return {
    boundary,
    wordCount
  };
}

/**
 * Handles Emit streaming assistant delta chunks for run-agent-turn.js.
 */
async function emitStreamingAssistantDeltaChunks({
  emitStreamEvent,
  iteration,
  toolState,
  toolBehavior,
  flush = false
}) {
  const messagePayload = extractStreamingMessageToolPayload(toolState);
  const stableText = trimStreamingTextToStableBoundary(
    messagePayload.text || '',
    messagePayload.textComplete === true
  );

  if (!stableText || toolState.emittedTextLength >= stableText.length) {
    return;
  }

  while (toolState.emittedTextLength < stableText.length) {
    const nextBatch = findStreamingWordBatch(
      stableText,
      toolState.emittedTextLength,
      STREAM_TEXT_CHUNK_WORDS
    );

    if (!nextBatch) {
      break;
    }

    if (!flush && nextBatch.wordCount < STREAM_TEXT_CHUNK_WORDS) {
      break;
    }

    const nextBoundary = flush && nextBatch.wordCount < STREAM_TEXT_CHUNK_WORDS
      ? stableText.length
      : nextBatch.boundary;
    const chunkText = stableText.slice(toolState.emittedTextLength, nextBoundary);

    if (!chunkText) {
      break;
    }

    await emitStreamEvent({
      eventType: 'assistant.delta',
      payload: {
        iteration,
        toolName: toolState.toolName,
        toolUseId: toolState.toolUseId,
        terminal: toolBehavior.terminal,
        text: chunkText,
        delivery: messagePayload.delivery || null
      }
    });

    toolState.emittedTextLength = nextBoundary;
  }
}

/**
 * Handles Emit early streaming tool events for run-agent-turn.js.
 */
async function emitEarlyStreamingToolEvents({
  emitStreamEvent,
  iteration,
  streamingToolStates,
  streamedRequestedToolUseIds,
  normalizedEvent
}) {
  const toolState = upsertStreamingToolState(streamingToolStates, normalizedEvent);

  if (!toolState || !toolState.toolUseId || !toolState.toolName) {
    return;
  }

  const toolBehavior = resolveStreamingToolBehavior({
    toolName: toolState.toolName,
    input: toolState.input
  });

  if (!toolState.requestedEmitted) {
    const messagePayload = extractMessageToolPayload({
      toolName: toolState.toolName,
      input: toolState.input,
      toolResult: null
    });

    await emitStreamEvent({
      eventType: 'tool.call.requested',
      payload: {
        iteration,
        toolName: toolState.toolName,
        toolUseId: toolState.toolUseId,
        input: toolState.input,
        terminal: toolBehavior.terminal,
        ...messagePayload
      }
    });

    toolState.requestedEmitted = true;
    streamedRequestedToolUseIds.add(toolState.toolUseId);
  }

  await emitStreamingAssistantDeltaChunks({
    emitStreamEvent,
    iteration,
    toolState,
    toolBehavior,
    flush: false
  });
}

/**
 * Handles Run agent turn for run-agent-turn.js.
 */
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
/**
 * Handles Emit stream event for run-agent-turn.js.
 */
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

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const hydratedMessages = applyHygiene(workingMessages, {
        maxMessages: env.agentPromptMessageLimit,
        provider
      });
      const providerTools = toProviderTools(toolDefinitions, caps, {
        enablePromptCaching: provider === 'anthropic' && env.anthropicPromptCachingEnabled,
        staticCacheTtl: env.anthropicStaticCacheTtl
      });
      const parallelToolCalls = false;
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
        cacheControl: null,
        promptCacheKey: provider === 'xai' && env.xaiPromptCachingEnabled
          ? `session:${run.session_id}`
          : null,
        toolChoice: buildRuntimeToolChoice({
          provider,
          hasTools: providerTools.length > 0,
          parallelToolCalls
        }),
        parallelToolCalls
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
        let textBuffer = '';
        const streamingToolStates = new Map();
        const streamedRequestedToolUseIds = new Set();

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

          if (
            normalizedEvent.type === NORMALIZED_STREAM_EVENT_TYPES.toolUseStart
            || normalizedEvent.type === NORMALIZED_STREAM_EVENT_TYPES.toolInputDelta
          ) {
            await emitEarlyStreamingToolEvents({
              emitStreamEvent,
              iteration,
              streamingToolStates,
              streamedRequestedToolUseIds,
              normalizedEvent
            });
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
        }

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
          const rawTextLength = String(normalizedOutput.rawText || '').length;

          await emitStreamEvent({
            eventType: 'agent.iteration.completed',
            payload: {
              iteration,
              stopReason: 'tool_call_truncated',
              toolCallCount: normalizedOutput.toolCalls.length,
              rawTextLength
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

        const outputContract = validateOutputContract(normalizedOutput);

        if (!outputContract.valid) {
          providerState = null;
          const rawText = normalizeVisibleText(normalizedOutput.rawText || '');
          const rawTextLength = rawText.length;

          await emitStreamEvent({
            eventType: 'llm.response.rejected',
            payload: {
              iteration,
              reason: outputContract.reason,
              toolCallCount: normalizedOutput.toolCalls.length,
              rawText
            }
          });

          await emitStreamEvent({
            eventType: 'agent.iteration.completed',
            payload: {
              iteration,
              stopReason: 'contract_violation',
              reason: outputContract.reason,
              toolCallCount: normalizedOutput.toolCalls.length,
              rawTextLength
            }
          });

          workingMessages.push({
            role: 'user',
            content: buildToolOnlyRetryMessage(outputContract.reason, normalizedOutput)
          });
          continue;
        }

        const toolBatchValidation = inspectToolBatch(normalizedOutput.toolCalls);

        if (!toolBatchValidation.valid) {
          providerState = null;

          await emitStreamEvent({
            eventType: 'llm.response.rejected',
            payload: {
              iteration,
              reason: toolBatchValidation.reason,
              toolNames: toolBatchValidation.toolNames || []
            }
          });

          await emitStreamEvent({
            eventType: 'agent.iteration.completed',
            payload: {
              iteration,
              stopReason: 'contract_violation',
              reason: toolBatchValidation.reason,
              toolCallCount: normalizedOutput.toolCalls.length
            }
          });

          workingMessages.push({
            role: 'user',
            content: buildToolBatchRetryMessage(toolBatchValidation)
          });
          continue;
        }

        await emitStreamEvent({
          eventType: 'agent.iteration.completed',
          payload: {
            iteration,
            stopReason: toolBatchValidation.terminalToolCall ? 'terminal_tool_requested' : 'tool_calls_requested',
            toolCallCount: normalizedOutput.toolCalls.length,
            rawTextLength: String(normalizedOutput.rawText || '').length
          }
        });

        if (normalizedOutput.assistantMessage) {
          workingMessages.push(normalizedOutput.assistantMessage);
        }

        let executedTerminalTool = null;

        for (const toolCall of normalizedOutput.toolCalls) {
          const toolBehavior = resolveToolCallBehavior({
            toolName: toolCall.name,
            input: toolCall.input
          });
          const streamingToolState = ensureStreamingToolStateForToolCall(streamingToolStates, toolCall);
          const messagePayload = extractMessageToolPayload({
            toolName: toolCall.name,
            input: toolCall.input,
            toolResult: null
          });

          if (!streamedRequestedToolUseIds.has(toolCall.id)) {
            await emitStreamEvent({
              eventType: 'tool.call.requested',
              payload: {
                iteration,
                toolName: toolCall.name,
                toolUseId: toolCall.id,
                input: toolCall.input,
                terminal: toolBehavior.terminal,
                ...messagePayload
              }
            });
          }

          await emitStreamingAssistantDeltaChunks({
            emitStreamEvent,
            iteration,
            toolState: streamingToolState,
            toolBehavior,
            flush: true
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

          const completionMessagePayload = extractMessageToolPayload({
            toolName: toolCall.name,
            input: toolCall.input,
            toolResult
          });

          try {
            await appendToolObservationEvent({
              run,
              iteration,
              toolCall,
              toolResult
            });
          } catch (error) {
            console.warn(`Unable to append tool observation for ${toolCall.name}:`, error.message);
          }

          await emitStreamEvent({
            eventType: 'tool.call.completed',
            payload: {
              iteration,
              toolName: toolCall.name,
              toolUseId: toolCall.id,
              resultStatus: toolResult.status,
              terminal: toolBehavior.terminal,
              outputPreview: JSON.stringify(toolResult).slice(0, 500),
              ...completionMessagePayload
            }
          });

          if (
            toolResult
            && toolResult.status === 'ok'
            && toolResult.output
            && toolResult.output.workout
          ) {
            await emitStreamEvent({
              eventType: 'workout.state.updated',
              payload: {
                iteration,
                toolName: toolCall.name,
                workout: toolResult.output.workout,
                appliedStateVersion: toolResult.output.workout.stateVersion || null,
                command: toolResult.output.command || null
              }
            });
          }

          if (toolBehavior.terminal && toolResult && toolResult.status === 'ok') {
            executedTerminalTool = {
              toolCall,
              toolResult,
              messagePayload: completionMessagePayload
            };
            break;
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

        if (executedTerminalTool) {
          if (
            executedTerminalTool.toolCall.name === 'idle'
            && requiresDurableUserReply(run.trigger_type)
          ) {
            providerState = null;

            await emitStreamEvent({
              eventType: 'llm.response.rejected',
              payload: {
                iteration,
                reason: 'missing_durable_user_reply',
                triggerType: run.trigger_type,
                terminalToolName: executedTerminalTool.toolCall.name
              }
            });

            await emitStreamEvent({
              eventType: 'agent.iteration.completed',
              payload: {
                iteration,
                stopReason: 'contract_violation',
                reason: 'missing_durable_user_reply',
                toolCallCount: normalizedOutput.toolCalls.length
              }
            });

            workingMessages.push({
              role: 'user',
              content: buildDurableReplyRetryMessage(run.trigger_type)
            });
            continue;
          }

          await emitStreamEvent({
            eventType: 'agent.loop.completed',
            payload: {
              provider,
              model,
              iterationsUsed: iteration,
              stopReason: 'terminal_tool',
              terminalToolName: executedTerminalTool.toolCall.name
            }
          });

          return {
            outputText: executedTerminalTool.messagePayload.text || '',
            provider,
            model,
            iterationsUsed: iteration,
            terminalToolName: executedTerminalTool.toolCall.name
          };
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

  const error = new Error(`Agent exceeded ${maxIterations} iterations without a terminal tool call`);
  error.code = 'AGENT_MAX_ITERATIONS_EXCEEDED';
  throw error;
}

module.exports = {
  runAgentTurn
};
