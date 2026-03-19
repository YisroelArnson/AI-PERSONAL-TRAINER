function getStopDecision({ iteration, maxIterations, normalizedOutput }) {
  if (normalizedOutput.toolCalls.length === 0) {
    return {
      shouldStop: true,
      reason: 'final_response'
    };
  }

  if (iteration >= maxIterations) {
    return {
      shouldStop: true,
      reason: 'max_iterations'
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
