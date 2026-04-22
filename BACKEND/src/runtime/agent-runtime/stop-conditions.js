/**
 * File overview:
 * Supports the agent runtime flow for stop conditions.
 *
 * Main functions in this file:
 * - getStopDecision: Gets Stop decision needed by this file.
 */

const { normalizeVisibleText } = require('./output-normalization.adapter');

/**
 * Gets Stop decision needed by this file.
 */
function getStopDecision({ iteration, maxIterations, normalizedOutput, toolBatchValidation }) {
  if (!normalizedOutput || normalizedOutput.toolCalls.length === 0) {
    return {
      shouldStop: true,
      reason: 'contract_violation'
    };
  }

  if (normalizeVisibleText(normalizedOutput.rawText || '')) {
    return {
      shouldStop: true,
      reason: 'contract_violation'
    };
  }

  if (iteration >= maxIterations) {
    return {
      shouldStop: true,
      reason: 'max_iterations'
    };
  }

  if (toolBatchValidation && toolBatchValidation.valid === false) {
    return {
      shouldStop: true,
      reason: 'contract_violation'
    };
  }

  if (toolBatchValidation && toolBatchValidation.terminalToolCall) {
    return {
      shouldStop: true,
      reason: 'terminal_tool_requested'
    };
  }

  return {
    shouldStop: false,
    reason: 'tool_calls_requested'
  };
}

module.exports = {
  getStopDecision
};
