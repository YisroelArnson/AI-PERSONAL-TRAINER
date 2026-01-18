// BACKEND/services/observability/logger.service.js
// Structured console logging for agent observability
// Provides both human-readable console output and structured JSON logging

/**
 * Log levels with numeric priority
 */
const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

/**
 * Current log level (can be set via environment variable)
 */
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Whether to output structured JSON (for log aggregators) or human-readable format
 */
const useStructuredLogs = process.env.STRUCTURED_LOGS === 'true';

/**
 * Color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Context storage for trace/span correlation
 */
let currentContext = {};

/**
 * Set the current context for log correlation
 * @param {Object} context - Context object with sessionId, userId, etc.
 */
function setContext(context) {
  currentContext = { ...currentContext, ...context };
}

/**
 * Clear the current context
 */
function clearContext() {
  currentContext = {};
}

/**
 * Get the current context
 * @returns {Object} Current context
 */
function getContext() {
  return { ...currentContext };
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/**
 * Format a session ID for display (first 8 chars)
 */
function formatSessionId(sessionId) {
  return sessionId ? sessionId.substring(0, 8) : '--------';
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(count) {
  if (!count) return '0';
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count.toString();
}

/**
 * Format cost in dollars
 */
function formatCost(cents) {
  if (!cents) return '$0.0000';
  return '$' + (cents / 100).toFixed(4);
}

/**
 * Format duration
 */
function formatDuration(ms) {
  if (!ms) return '0ms';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

/**
 * Truncate text for display
 */
function truncate(text, maxLength = 60) {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Get timestamp string for console
 */
function getTimestamp() {
  return new Date().toISOString().substring(11, 23);
}

// =============================================================================
// STRUCTURED JSON LOGGING
// =============================================================================

/**
 * Create a structured log entry
 * @param {string} level - Log level
 * @param {string} event - Event name/type
 * @param {Object} data - Additional data to log
 * @returns {Object} Structured log object
 */
function createLogEntry(level, event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...currentContext,
    ...data
  };

  // Remove undefined values
  Object.keys(entry).forEach(key => {
    if (entry[key] === undefined) {
      delete entry[key];
    }
  });

  return entry;
}

/**
 * Output structured JSON log
 */
function outputStructuredLog(entry) {
  const json = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(json);
      break;
    case 'warn':
      console.warn(json);
      break;
    default:
      console.log(json);
  }
}

// =============================================================================
// HUMAN-READABLE CONSOLE OUTPUT
// =============================================================================

/**
 * Output human-readable console log
 * @param {string} level - Log level
 * @param {string} icon - Emoji icon
 * @param {string} message - Main message
 * @param {string} details - Additional details
 */
function outputReadableLog(level, icon, message, details = '') {
  const timestamp = getTimestamp();
  const sessionId = formatSessionId(currentContext.sessionId);
  
  let levelColor = colors.white;
  switch (level) {
    case 'error': levelColor = colors.red; break;
    case 'warn': levelColor = colors.yellow; break;
    case 'debug': levelColor = colors.gray; break;
  }

  const detailStr = details ? ` ${colors.dim}${details}${colors.reset}` : '';
  
  console.log(
    `${colors.dim}${timestamp}${colors.reset} ` +
    `${colors.cyan}[${sessionId}]${colors.reset} ` +
    `${icon} ${levelColor}${message}${colors.reset}${detailStr}`
  );
}

// =============================================================================
// MAIN LOGGING FUNCTIONS
// =============================================================================

/**
 * Log at debug level
 */
function debug(event, data = {}) {
  if (LOG_LEVELS.debug < currentLevel) return;
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('debug', event, data));
  } else {
    outputReadableLog('debug', '🔍', event, data.message || '');
  }
}

/**
 * Log at info level
 */
function info(event, data = {}) {
  if (LOG_LEVELS.info < currentLevel) return;
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', event, data));
  } else {
    outputReadableLog('info', 'ℹ️', event, data.message || '');
  }
}

/**
 * Log at warn level
 */
function warn(event, data = {}) {
  if (LOG_LEVELS.warn < currentLevel) return;
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('warn', event, data));
  } else {
    outputReadableLog('warn', '⚠️', event, data.message || '');
  }
}

/**
 * Log at error level
 */
function error(event, data = {}) {
  if (LOG_LEVELS.error < currentLevel) return;
  
  // Handle Error objects
  if (data.error instanceof Error) {
    data.errorMessage = data.error.message;
    data.errorStack = data.error.stack;
    delete data.error;
  }
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('error', event, data));
  } else {
    const errorMsg = data.errorMessage || data.message || '';
    outputReadableLog('error', '❌', event, errorMsg);
  }
}

// =============================================================================
// AGENT-SPECIFIC LOGGING
// =============================================================================

/**
 * Log user message
 */
function logUserMessage(sessionId, message) {
  setContext({ sessionId });
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'user_message', { message: truncate(message, 200) }));
  } else {
    outputReadableLog('info', '👤', `${colors.white}User:${colors.reset} "${truncate(message, 80)}"`);
  }
}

/**
 * Log LLM request
 */
function logLLMRequest(sessionId, model, estimatedTokens = null) {
  setContext({ sessionId });
  
  const tokenInfo = estimatedTokens ? `est. ${formatTokens(estimatedTokens)} tokens` : '';
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'llm_request', { model, estimated_tokens: estimatedTokens }));
  } else {
    outputReadableLog('info', '📤', `${colors.magenta}LLM Request${colors.reset} → ${model}`, tokenInfo);
  }
}

/**
 * Log LLM response
 */
function logLLMResponse(sessionId, params) {
  const { toolCall, tokens, costCents, durationMs } = params;
  setContext({ sessionId });
  
  // Build response description
  let responseDesc = '';
  if (toolCall) {
    responseDesc = `${colors.blue}tool_call:${colors.reset} ${toolCall.name}`;
  } else {
    responseDesc = `${colors.dim}(text response)${colors.reset}`;
  }
  
  // Build token info
  const tokenInfo = tokens?.cached > 0
    ? `${formatTokens(tokens.total)} tokens (${formatTokens(tokens.cached)} cached)`
    : `${formatTokens(tokens?.total || 0)} tokens`;
  
  const details = `${tokenInfo} | ${formatCost(costCents)} | ${formatDuration(durationMs)}`;
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'llm_response', {
      tool_call: toolCall?.name,
      tokens,
      cost_cents: costCents,
      duration_ms: durationMs
    }));
  } else {
    outputReadableLog('info', '📥', `${colors.magenta}LLM Response${colors.reset} ← ${responseDesc}`, details);
  }
}

/**
 * Log tool call
 */
function logToolCall(sessionId, toolName, args) {
  setContext({ sessionId });
  
  const argsPreview = truncate(JSON.stringify(args), 50);
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'tool_call', { tool: toolName, arguments: args }));
  } else {
    outputReadableLog('info', '🔧', `${colors.yellow}Tool Call${colors.reset} → ${toolName}`, argsPreview);
  }
}

/**
 * Log tool result
 */
function logToolResult(sessionId, toolName, success, durationMs = null) {
  setContext({ sessionId });
  
  const icon = success ? '✓' : '✗';
  const color = success ? colors.green : colors.red;
  const duration = durationMs ? formatDuration(durationMs) : '';
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'tool_result', {
      tool: toolName,
      success,
      duration_ms: durationMs
    }));
  } else {
    outputReadableLog('info', '🔧', `${colors.yellow}Tool Result${colors.reset} ← ${toolName}: ${color}${icon}${colors.reset}`, duration);
  }
}

/**
 * Log session start
 */
function logSessionStart(sessionId) {
  setContext({ sessionId });
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'session_start', {}));
  } else {
    outputReadableLog('info', '🆕', `${colors.green}Session started${colors.reset}`);
  }
}

/**
 * Log session end
 */
function logSessionEnd(sessionId, status, stats = {}) {
  setContext({ sessionId });
  
  const { totalTokens, cachedTokens, costCents, durationMs } = stats;
  
  const icon = status === 'error' ? '❌' : '✅';
  const color = status === 'error' ? colors.red : colors.green;
  
  const details = [
    totalTokens ? `${formatTokens(totalTokens)} tokens` : null,
    cachedTokens ? `(${formatTokens(cachedTokens)} cached)` : null,
    costCents ? formatCost(costCents) : null,
    durationMs ? formatDuration(durationMs) : null
  ].filter(Boolean).join(' | ');
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('info', 'session_end', { status, ...stats }));
  } else {
    outputReadableLog('info', icon, `${color}Session ${status}${colors.reset}`, details);
  }
  
  clearContext();
}

/**
 * Log an error in agent context
 */
function logAgentError(sessionId, errorMsg, context = null) {
  setContext({ sessionId });
  
  const details = context ? `(${context})` : '';
  
  if (useStructuredLogs) {
    outputStructuredLog(createLogEntry('error', 'agent_error', { message: errorMsg, context }));
  } else {
    outputReadableLog('error', '❌', `${colors.red}Error:${colors.reset} ${errorMsg}`, details);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  LOG_LEVELS,
  setContext,
  clearContext,
  getContext,
  
  // Basic levels
  debug,
  info,
  warn,
  error,
  
  // Agent-specific logging
  logUserMessage,
  logLLMRequest,
  logLLMResponse,
  logToolCall,
  logToolResult,
  logSessionStart,
  logSessionEnd,
  logAgentError,
  
  // Utilities
  formatTokens,
  formatCost,
  formatDuration,
  truncate
};
