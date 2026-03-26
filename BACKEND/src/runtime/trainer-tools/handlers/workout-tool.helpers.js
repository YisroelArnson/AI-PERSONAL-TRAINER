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

module.exports = {
  semanticError,
  validationError
};
