const { getXAIClient } = require('../../../infra/xai/client');
const { ERROR_CLASSES, NORMALIZED_STREAM_EVENT_TYPES } = require('../types');
const {
  extractDisplayText,
  normalizeVisibleText
} = require('../output-normalization.adapter');

function providerName() {
  return 'xai';
}

function validateCapabilities(runtimeInput, caps) {
  if (runtimeInput.tools && runtimeInput.tools.length > 0 && !caps.supportsTools) {
    throw new Error(`Model ${caps.model} does not support tools`);
  }
}

function toInputText(text) {
  return {
    type: 'input_text',
    text: String(text || '')
  };
}

function toXaiInputMessage(message) {
  const contentBlocks = Array.isArray(message.content)
    ? message.content
    : [{ type: 'text', text: String(message.content || '') }];
  const text = contentBlocks
    .filter(block => block && block.type === 'text')
    .map(block => String(block.text || ''))
    .join('');

  if (message.role === 'assistant') {
    return {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text
        }
      ]
    };
  }

  return {
    type: 'message',
    role: message.role === 'system' ? 'system' : 'user',
    content: [toInputText(text)]
  };
}

function buildInitialRequest(runtimeInput) {
  const input = [];

  if (runtimeInput.systemPrompt) {
    input.push({
      type: 'message',
      role: 'system',
      content: [toInputText(runtimeInput.systemPrompt)]
    });
  }

  for (const message of runtimeInput.messages || []) {
    input.push(toXaiInputMessage(message));
  }

  const request = {
    model: runtimeInput.model,
    input,
    max_output_tokens: runtimeInput.maxOutputTokens,
    parallel_tool_calls: runtimeInput.parallelToolCalls !== true ? false : true
  };

  if (runtimeInput.tools && runtimeInput.tools.length > 0) {
    request.tools = runtimeInput.tools;
    request.tool_choice = runtimeInput.toolChoice || 'auto';
  }

  if (runtimeInput.promptCacheKey) {
    request.prompt_cache_key = runtimeInput.promptCacheKey;
  }

  return request;
}

function buildContinuationRequest(runtimeInput) {
  const state = runtimeInput.providerState || {};
  const request = {
    model: runtimeInput.model,
    previous_response_id: state.previousResponseId,
    input: state.pendingInputItems || [],
    max_output_tokens: runtimeInput.maxOutputTokens,
    parallel_tool_calls: runtimeInput.parallelToolCalls !== true ? false : true
  };

  if (runtimeInput.tools && runtimeInput.tools.length > 0) {
    request.tools = runtimeInput.tools;
    request.tool_choice = runtimeInput.toolChoice || 'auto';
  }

  if (runtimeInput.promptCacheKey) {
    request.prompt_cache_key = runtimeInput.promptCacheKey;
  }

  return request;
}

function buildRequest(runtimeInput) {
  if (
    runtimeInput.providerState
    && runtimeInput.providerState.previousResponseId
    && Array.isArray(runtimeInput.providerState.pendingInputItems)
    && runtimeInput.providerState.pendingInputItems.length > 0
  ) {
    return buildContinuationRequest(runtimeInput);
  }

  return buildInitialRequest(runtimeInput);
}

function createStream(providerRequest) {
  const client = getXAIClient();
  return client.responses.stream(providerRequest);
}

function normalizeStreamEvent(providerEvent) {
  if (providerEvent.type === 'response.created') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.messageStart,
      payload: {
        provider: 'xai',
        messageId: providerEvent.response.id,
        model: providerEvent.response.model || null
      }
    };
  }

  if (providerEvent.type === 'response.output_text.delta') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.textDelta,
      payload: {
        text: providerEvent.delta
      }
    };
  }

  if (providerEvent.type === 'response.completed') {
    return {
      type: NORMALIZED_STREAM_EVENT_TYPES.messageDelta,
      payload: {
        stopReason: providerEvent.response.status || null,
        stopSequence: null,
        usage: providerEvent.response.usage || {}
      }
    };
  }

  return null;
}

function extractTextFromResponse(response) {
  if (response && typeof response.output_text === 'string' && response.output_text) {
    return response.output_text;
  }

  const outputItems = Array.isArray(response && response.output) ? response.output : [];

  return outputItems
    .filter(item => item && item.type === 'message')
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(content => content && (content.type === 'output_text' || content.type === 'text'))
    .map(content => String(content.text || ''))
    .join('');
}

async function extractFinalOutput(stream, textBuffer) {
  const finalResponse = await stream.finalResponse();

  return {
    provider: 'xai',
    responseId: finalResponse.id,
    outputText: textBuffer || extractTextFromResponse(finalResponse),
    stopReason: finalResponse.status || null,
    usage: finalResponse.usage || {},
    rawMessage: finalResponse,
    rawResponse: finalResponse
  };
}

function parseToolCallArguments(argumentsValue) {
  if (!argumentsValue || typeof argumentsValue !== 'string') {
    return {};
  }

  try {
    return JSON.parse(argumentsValue);
  } catch (error) {
    return {};
  }
}

function toInternalAssistantContent(item) {
  if (!item) {
    return [];
  }

  if (item.type === 'message') {
    return (Array.isArray(item.content) ? item.content : [])
      .filter(content => content && (content.type === 'output_text' || content.type === 'text'))
      .map(content => ({
        type: 'text',
        text: String(content.text || '')
      }));
  }

  if (item.type === 'function_call') {
    return [{
      type: 'tool_use',
      id: item.call_id || item.id,
      name: item.name,
      input: parseToolCallArguments(item.arguments)
    }];
  }

  return [];
}

function normalizeOutput(finalOutput) {
  const rawResponse = finalOutput.rawResponse || finalOutput.rawMessage || {};
  const outputItems = Array.isArray(rawResponse.output) ? rawResponse.output : [];
  const assistantMessageContent = outputItems
    .flatMap(toInternalAssistantContent)
    .filter(Boolean);
  const toolCalls = assistantMessageContent.filter(block => block.type === 'tool_use');
  const textBlocks = assistantMessageContent.filter(block => block.type === 'text');
  const rawText = textBlocks.map(block => block.text).join('') || finalOutput.outputText || '';
  const extractedDisplayText = extractDisplayText(rawText, {
    preferCommentaryAsFinal: toolCalls.length === 0
  });
  const fallbackOutputText = extractedDisplayText.hasExplicitPhase && toolCalls.length > 0
    ? ''
    : normalizeVisibleText(rawText);
  const outputText = extractedDisplayText.finalText
    || (toolCalls.length === 0 ? extractedDisplayText.commentaryText : '')
    || fallbackOutputText;

  return {
    outputText,
    commentaryText: extractedDisplayText.commentaryText,
    finalText: extractedDisplayText.finalText || outputText,
    toolCalls,
    assistantMessage: assistantMessageContent.length > 0
      ? {
          role: 'assistant',
          content: assistantMessageContent
        }
      : null,
    stopReason: finalOutput.stopReason,
    usage: finalOutput.usage || {},
    rawText,
    rawMessage: rawResponse,
    providerState: {
      previousResponseId: finalOutput.responseId || rawResponse.id || null
    }
  };
}

function accumulateToolResultState({ currentState, finalOutput, toolCall, toolResult }) {
  const previousResponseId = finalOutput.responseId
    || (currentState && currentState.previousResponseId)
    || null;
  const pendingInputItems = currentState && Array.isArray(currentState.pendingInputItems)
    ? [...currentState.pendingInputItems]
    : [];

  pendingInputItems.push({
    type: 'function_call_output',
    call_id: toolCall.id,
    output: typeof toolResult === 'string'
      ? toolResult
      : JSON.stringify(toolResult)
  });

  return {
    previousResponseId,
    pendingInputItems
  };
}

function buildToolResultMessage() {
  return null;
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

  if (status === 502 || status === 503 || status === 504) {
    return ERROR_CLASSES.providerUnavailable;
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
  accumulateToolResultState,
  buildRequest,
  buildToolResultMessage,
  classifyError,
  createStream,
  extractFinalOutput,
  normalizeOutput,
  normalizeStreamEvent,
  providerName,
  validateCapabilities
};
