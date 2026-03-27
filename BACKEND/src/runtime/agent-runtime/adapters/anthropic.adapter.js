const { getAnthropicClient } = require('../../../infra/anthropic/client');
const { ERROR_CLASSES, NORMALIZED_STREAM_EVENT_TYPES } = require('../types');

function providerName() {
  return 'anthropic';
}

function validateCapabilities(runtimeInput, caps) {
  if (runtimeInput.tools && runtimeInput.tools.length > 0 && !caps.supportsTools) {
    throw new Error(`Model ${caps.model} does not support tools`);
  }
}

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
    request.tool_choice = runtimeInput.toolChoice;
  }

  if (runtimeInput.tools && runtimeInput.tools.length > 0) {
    request.tools = runtimeInput.tools;
  }

  return request;
}

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

function createStream(providerRequest) {
  const client = getAnthropicClient();
  return client.messages.stream(providerRequest);
}

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

function extractTextFromMessage(message) {
  return (message.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

async function extractFinalOutput(stream, textBuffer) {
  const finalMessage = await stream.finalMessage();

  return {
    outputText: textBuffer || extractTextFromMessage(finalMessage),
    stopReason: finalMessage.stop_reason,
    usage: finalMessage.usage,
    rawMessage: finalMessage
  };
}

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
  providerName,
  validateCapabilities,
  buildRequest,
  createStream,
  normalizeStreamEvent,
  extractFinalOutput,
  classifyError
};
