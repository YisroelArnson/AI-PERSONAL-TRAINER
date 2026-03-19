const { stableJsonStringify } = require('../../shared/json');

function blockToInternalContent(block) {
  if (!block) {
    return null;
  }

  if (block.type === 'text') {
    return {
      type: 'text',
      text: block.text
    };
  }

  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input || {}
    };
  }

  return null;
}

function stringifyToolResultContent(result) {
  return typeof result === 'string' ? result : stableJsonStringify(result);
}

function buildToolResultMessage(toolCall, toolResult) {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        toolUseId: toolCall.id,
        content: stringifyToolResultContent(toolResult)
      }
    ]
  };
}

function normalizeAnthropicOutput(finalOutput) {
  const rawMessage = finalOutput.rawMessage || {};
  const content = Array.isArray(rawMessage.content) ? rawMessage.content : [];
  const assistantMessageContent = content
    .map(blockToInternalContent)
    .filter(Boolean);
  const toolCalls = assistantMessageContent.filter(block => block.type === 'tool_use');
  const textBlocks = assistantMessageContent.filter(block => block.type === 'text');
  const outputText = textBlocks.map(block => block.text).join('').trim() || finalOutput.outputText || '';

  return {
    outputText,
    toolCalls,
    assistantMessage: {
      role: 'assistant',
      content: assistantMessageContent
    },
    stopReason: finalOutput.stopReason,
    usage: finalOutput.usage || {},
    rawMessage
  };
}

module.exports = {
  buildToolResultMessage,
  normalizeAnthropicOutput
};
