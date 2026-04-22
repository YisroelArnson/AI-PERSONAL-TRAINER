/**
 * File overview:
 * Supports the agent runtime flow for output normalization.
 *
 * Main functions in this file:
 * - normalizeVisibleText: Normalizes Visible text into the format this file expects.
 * - blockToInternalContent: Handles Block to internal content for output-normalization.adapter.js.
 * - stringifyToolResultContent: Handles Stringify tool result content for output-normalization.adapter.js.
 * - buildToolResultMessage: Builds a Tool result message used by this file.
 * - normalizeAnthropicOutput: Normalizes Anthropic output into the format this file expects.
 */

const { stableJsonStringify } = require('../../shared/json');

/**
 * Normalizes Visible text into the format this file expects.
 */
function normalizeVisibleText(value) {
  return String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Handles Block to internal content for output-normalization.adapter.js.
 */
function blockToInternalContent(block) {
  if (!block) {
    return null;
  }

  if (block.type === 'text') {
    return {
      type: 'text',
      text: String(block.text || '')
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

/**
 * Handles Stringify tool result content for output-normalization.adapter.js.
 */
function stringifyToolResultContent(result) {
  return typeof result === 'string' ? result : stableJsonStringify(result);
}

/**
 * Builds a Tool result message used by this file.
 */
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

/**
 * Normalizes Anthropic output into the format this file expects.
 */
function normalizeAnthropicOutput(finalOutput) {
  const rawMessage = finalOutput.rawMessage || {};
  const content = Array.isArray(rawMessage.content) ? rawMessage.content : [];
  const assistantMessageContent = content
    .map(blockToInternalContent)
    .filter(Boolean);
  const toolCalls = assistantMessageContent.filter(block => block.type === 'tool_use');
  const textBlocks = assistantMessageContent.filter(block => block.type === 'text');
  const rawText = normalizeVisibleText(
    textBlocks.map(block => String(block.text || '')).join('') || finalOutput.outputText || ''
  );

  return {
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
    rawMessage
  };
}

module.exports = {
  buildToolResultMessage,
  normalizeAnthropicOutput,
  normalizeVisibleText
};
