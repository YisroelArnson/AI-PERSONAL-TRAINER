
/**
 * Handles Semantic error for workout-tool.helpers.js.
 */
function semanticError(code, explanation, agentGuidance, suggestedFix = {}) {
  return {
    status: 'semantic_error',
    error: {
      code,
      explanation,
      agent_guidance: agentGuidance,
      suggested_fix: suggestedFix,
      retryable_in_run: true
    }
  };
}

/**
 * Handles Validation error for workout-tool.helpers.js.
 */
function validationError(toolName, issue) {
  const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || '');
  const field = path || null;

  return {
    status: 'validation_error',
    error: {
      code: 'INVALID_TOOL_INPUT',
      explanation: `Invalid input for ${toolName}: ${issue.message}`,
      agent_guidance: 'Retry the same tool using the declared schema and include all required structured fields.',
      suggested_fix: {
        field
      },
      retryable_in_run: true
    }
  };
}

function mutationBusyError(error, explanation = 'Another request is already updating this workout, so this mutation was not applied.') {
  if (!error || error.code !== 'WORKOUT_MUTATION_LOCK_BUSY') {
    return null;
  }

  return semanticError(
    'WORKOUT_MUTATION_LOCK_BUSY',
    explanation,
    'Reload the latest workout context in the prompt and retry only if the same mutation is still appropriate.',
    error.details || {}
  );
}

module.exports = {
  mutationBusyError,
  semanticError,
  validationError
};
