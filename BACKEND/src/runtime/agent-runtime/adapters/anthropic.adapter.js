/**
 * File overview:
 * Supports the agent runtime flow for anthropic.
 *
 * Main functions in this file:
 * - providerName: Handles Provider name for anthropic.adapter.js.
 * - validateCapabilities: Validates Capabilities before it is used.
 * - buildRequest: Builds a Request used by this file.
 * - buildProviderContentBlock: Builds a Provider content block used by this file.
 * - buildProviderMessage: Builds a Provider message used by this file.
 * - createStream: Creates a Stream used by this file.
 * - normalizeStreamEvent: Normalizes Stream event into the format this file expects.
 * - extractTextFromMessage: Handles Extract text from message for anthropic.adapter.js.
 * - extractFinalOutput: Handles Extract final output for anthropic.adapter.js.
 * - classifyError: Handles Classify error for anthropic.adapter.js.
 */

const { getAnthropicClient } = require('../../../infra/anthropic/client');
const { ERROR_CLASSES, NORMALIZED_STREAM_EVENT_TYPES } = require('../types');
const {
  buildToolResultMessage,
  normalizeAnthropicOutput
} = require('../output-normalization.adapter');

/**
 * Handles Provider name for anthropic.adapter.js.
 */
function providerName() {
  return 'anthropic';
}

/**
 * Validates Capabilities before it is used.
 */
function validateCapabilities(runtimeInput, caps) {
  if (runtimeInput.tools && runtimeInput.tools.length > 0 && !caps.supportsTools) {
    throw new Error(`Model ${caps.model} does not support tools`);
  }
}

/**
 * Builds a Request used by this file.
 */
function buildRequest(runtimeInput) {
  const request = {
    model: runtimeInput.model,
    max_tokens: runtimeInput.maxOutputTokens,
    system: runtimeInput.systemPromptBlocks || runtimeInput.systemPrompt,
    messages: runtimeInput.messages.map(message => buildProviderMessage(message)),
    metadata: {
      user_id: runtimeInput.userId
    }
  };

  if (runtimeInput.cacheControl) {
    request.cache_control = runtimeInput.cacheControl;
  }

  if (runtimeInput.toolChoice) {
    request.tool_choice = runtimeInput.toolChoice === 'auto'
      ? {
          type: 'auto',
          disable_parallel_tool_use: runtimeInput.parallelToolCalls !== true
        }
      : runtimeInput.toolChoice;
  }

  if (runtimeInput.tools && runtimeInput.tools.length > 0) {
    request.tools = runtimeInput.tools;
  }

  return request;
}

/**
 * Builds a Provider content block used by this file.
 */
function buildProviderContentBlock(block) {
  if (typeof block === 'string') {
    return {
      type: 'text',
      text: block
    };
  }

  if (block.type === 'text') {
    const providerBlock = {
      type: 'text',
      text: block.text
    };

    if (block.cache_control) {
      providerBlock.cache_control = block.cache_control;
    }

    return providerBlock;
  }

  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input || {}
    };
  }

  if (block.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_use_id: block.toolUseId,
      content: block.content
    };
  }

  throw new Error(`Unsupported message content block: ${block.type}`);
}

/**
 * Builds a Provider message used by this file.
 */
function buildProviderMessage(message) {
  if (typeof message.content === 'string') {
    return {
      role: message.role,
      content: message.content
    };
  }

  return {
    role: message.role,
    content: message.content.map(buildProviderContentBlock)
  };
}

/**
 * Creates a Stream used by this file.
 */
function createStream(providerRequest) {
  const client = getAnthropicClient();
  return client.messages.stream(providerRequest);
}

/**
 * Normalizes Stream event into the format this file expects.
 */
function normalizeStreamEvent(providerEvent) {
  if (providerEvent.type === 'message_start') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.messageStart,
      payload: {
        provider: 'anthropic',
        messageId: providerEvent.message.id,
        model: providerEvent.message.model
      }
    };
  }

  if (
    providerEvent.type === 'content_block_start'
    && providerEvent.content_block
    && providerEvent.content_block.type === 'tool_use'
  ) {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.toolUseStart,
      payload: {
        streamKey: `content_block:${providerEvent.index}`,
        blockIndex: providerEvent.index,
        toolUseId: providerEvent.content_block.id,
        toolName: providerEvent.content_block.name,
        input: providerEvent.content_block.input || {}
      }
    };
  }

  if (
    providerEvent.type === 'content_block_delta' &&
    providerEvent.delta &&
    providerEvent.delta.type === 'text_delta'
  ) {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.textDelta,
      payload: {
        text: providerEvent.delta.text
      }
    };
  }

  if (
    providerEvent.type === 'content_block_delta'
    && providerEvent.delta
    && providerEvent.delta.type === 'input_json_delta'
  ) {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.toolInputDelta,
      payload: {
        streamKey: `content_block:${providerEvent.index}`,
        blockIndex: providerEvent.index,
        partialJson: providerEvent.delta.partial_json || ''
      }
    };
  }

  if (providerEvent.type === 'message_delta') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.messageDelta,
      payload: {
        stopReason: providerEvent.delta.stop_reason,
        stopSequence: providerEvent.delta.stop_sequence,
        usage: providerEvent.usage
      }
    };
  }

  if (providerEvent.type === 'message_stop') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.messageStop,
      payload: {}
    };
  }

  return null;
}

/**
 * Handles Extract text from message for anthropic.adapter.js.
 */
function extractTextFromMessage(message) {
  return (message.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

/**
 * Handles Extract final output for anthropic.adapter.js.
 */
async function extractFinalOutput(stream, textBuffer) {
  const finalMessage = await stream.finalMessage();

  return {
    outputText: textBuffer || extractTextFromMessage(finalMessage),
    stopReason: finalMessage.stop_reason,
    usage: finalMessage.usage,
    rawMessage: finalMessage
  };
}

/**
 * Handles Classify error for anthropic.adapter.js.
 */
function classifyError(error) {
  const status = error && error.status ? error.status : null;

  if (status === 401 || status === 403) {
    return ERROR_CLASSES.authError;
  }

  if (status === 400 || status === 404 || status === 422) {
    return ERROR_CLASSES.invalidRequest;
  }

  if (status === 429) {
    return ERROR_CLASSES.rateLimited;
  }

  if (status && status >= 500) {
    return ERROR_CLASSES.providerInternal;
  }

  if (error && error.code && String(error.code).includes('ECONN')) {
    return ERROR_CLASSES.retryableNetwork;
  }

  return ERROR_CLASSES.unknown;
}

module.exports = {
  accumulateToolResultState() {
    return null;
  },
  buildToolResultMessage,
  providerName,
  validateCapabilities,
  buildRequest,
  createStream,
  normalizeStreamEvent,
  extractFinalOutput,
  normalizeOutput: normalizeAnthropicOutput,
  classifyError
};
