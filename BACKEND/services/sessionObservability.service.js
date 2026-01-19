// BACKEND/services/sessionObservability.service.js
// Unified Session & Observability Service
// Handles session management, event logging, context building, and console output

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const { calculateCostCents } = require('./observability/pricing');

dotenv.config();

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

// =============================================================================
// CONSOLE LOGGING
// Color codes for terminal output
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

/**
 * Format a session ID for display (first 8 chars)
 */
function formatSessionId(sessionId) {
  return sessionId ? sessionId.substring(0, 8) : '????????';
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count.toString();
}

/**
 * Format cost in dollars
 */
function formatCost(cents) {
  return '$' + (cents / 100).toFixed(4);
}

/**
 * Format duration
 */
function formatDuration(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

/**
 * Truncate text for console display
 */
function truncate(text, maxLength = 60) {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Log to console with session context
 */
function consoleLog(sessionId, icon, message, details = '') {
  const timestamp = new Date().toISOString().substring(11, 23);
  const sid = formatSessionId(sessionId);
  const detailStr = details ? ` ${colors.dim}${details}${colors.reset}` : '';
  console.log(
    `${colors.dim}${timestamp}${colors.reset} ` +
    `${colors.cyan}[${sid}]${colors.reset} ` +
    `${icon} ${message}${detailStr}`
  );
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Create a new session for a user
 * @param {string} userId - User UUID
 * @param {Object} metadata - Optional metadata
 * @returns {Object} Session object
 */
async function createSession(userId, metadata = {}) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      metadata,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;

  consoleLog(data.id, '🆕', `${colors.green}Session created${colors.reset}`);
  
  return data;
}

/**
 * Get or create a session for a user
 * Returns the most recent active session or creates a new one
 * @param {string} userId - User UUID
 * @returns {Object} Session object
 */
async function getOrCreateSession(userId) {
  // Try to get most recent active session
  const { data: existing, error: fetchError } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  // Create new session
  return await createSession(userId);
}

/**
 * Get session by ID
 * @param {string} sessionId - Session UUID
 * @returns {Object} Session object
 */
async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * End a session and finalize totals
 * @param {string} sessionId - Session UUID
 * @param {string} status - Final status ('completed' or 'error')
 * @param {string} errorMessage - Error message if status is 'error'
 */
async function endSession(sessionId, status = 'completed', errorMessage = null) {
  // Calculate totals from events
  const { data: events } = await supabase
    .from('agent_session_events')
    .select('event_type, data, duration_ms')
    .eq('session_id', sessionId)
    .eq('event_type', 'llm_response');

  let totalTokens = 0;
  let cachedTokens = 0;
  let totalCostCents = 0;
  let totalDurationMs = 0;

  for (const event of events || []) {
    const tokens = event.data?.tokens || {};
    totalTokens += tokens.total || 0;
    cachedTokens += tokens.cached || 0;
    totalCostCents += event.data?.cost_cents || 0;
    totalDurationMs += event.duration_ms || 0;
  }

  // Update session
  const { error } = await supabase
    .from('agent_sessions')
    .update({
      status,
      total_tokens: totalTokens,
      cached_tokens: cachedTokens,
      total_cost_cents: totalCostCents,
      updated_at: new Date().toISOString(),
      metadata: errorMessage ? { error: errorMessage } : undefined
    })
    .eq('id', sessionId);

  if (error) throw error;

  // Log completion
  const icon = status === 'error' ? '❌' : '✅';
  const color = status === 'error' ? colors.red : colors.green;
  consoleLog(
    sessionId,
    icon,
    `${color}Session ${status}${colors.reset}`,
    `${formatTokens(totalTokens)} tokens (${formatTokens(cachedTokens)} cached) | ${formatCost(totalCostCents)} | ${formatDuration(totalDurationMs)}`
  );
}

/**
 * Update context start sequence (for checkpointing)
 * @param {string} sessionId - Session UUID
 * @param {number} newStartSequence - New context start sequence
 */
async function updateContextStart(sessionId, newStartSequence) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .update({ context_start_sequence: newStartSequence })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user's session history
 * @param {string} userId - User UUID
 * @param {number} limit - Max sessions to return
 * @returns {Array} Sessions
 */
async function getUserSessions(userId, limit = 10) {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// =============================================================================
// EVENT LOGGING
// =============================================================================

/**
 * Get next sequence number for a session
 */
async function getNextSequence(sessionId) {
  const { data } = await supabase
    .from('agent_session_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .single();

  return (data?.sequence_number ?? -1) + 1;
}

/**
 * Log a generic event
 * @param {string} sessionId - Session UUID
 * @param {string} eventType - Event type
 * @param {Object} data - Event data
 * @param {number} durationMs - Duration in milliseconds (optional)
 * @returns {Object} Created event
 */
async function logEvent(sessionId, eventType, data, durationMs = null) {
  const sequenceNumber = await getNextSequence(sessionId);

  const { data: event, error } = await supabase
    .from('agent_session_events')
    .insert({
      session_id: sessionId,
      sequence_number: sequenceNumber,
      event_type: eventType,
      data,
      duration_ms: durationMs,
      timestamp: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;

  // Update session timestamp
  await supabase
    .from('agent_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  return event;
}

/**
 * Log a user message
 * @param {string} sessionId - Session UUID
 * @param {string} message - User's message
 */
async function logUserMessage(sessionId, message) {
  consoleLog(
    sessionId,
    '👤',
    `${colors.white}User:${colors.reset} "${truncate(message, 80)}"`
  );

  return await logEvent(sessionId, 'user_message', { message });
}

/**
 * Log an LLM request (prompt being sent)
 * @param {string} sessionId - Session UUID
 * @param {string} model - Model name
 * @param {string} prompt - Full prompt text
 * @param {number} estimatedTokens - Estimated token count
 */
async function logLLMRequest(sessionId, model, prompt, estimatedTokens = null) {
  consoleLog(
    sessionId,
    '📤',
    `${colors.magenta}LLM Request${colors.reset} → ${model}`,
    estimatedTokens ? `est. ${formatTokens(estimatedTokens)} tokens` : ''
  );

  return await logEvent(sessionId, 'llm_request', {
    model,
    prompt,
    estimated_tokens: estimatedTokens
  });
}

/**
 * Log an LLM response
 * @param {string} sessionId - Session UUID
 * @param {Object} params - Response parameters
 * @param {Object} params.rawResponse - Raw OpenAI API response object
 * @param {number} params.durationMs - Request duration
 */
async function logLLMResponse(sessionId, params) {
  const { rawResponse, durationMs } = params;

  // Extract usage from raw response
  const usage = rawResponse?.usage;
  const model = rawResponse?.model;
  const content = rawResponse?.choices?.[0]?.message?.content;

  // Calculate tokens for session totals
  const tokens = {
    prompt: usage?.prompt_tokens || 0,
    completion: usage?.completion_tokens || 0,
    cached: usage?.prompt_tokens_details?.cached_tokens || 0,
    total: usage?.total_tokens || 0
  };

  // Calculate cost
  const costCents = calculateCostCents(
    model,
    tokens.prompt,
    tokens.completion,
    tokens.cached
  );

  // Build console output
  let responseDesc = content ? `"${truncate(content, 50)}"` : `${colors.dim}(empty)${colors.reset}`;

  const tokenInfo = tokens.cached > 0 
    ? `${formatTokens(tokens.total)} tokens (${formatTokens(tokens.cached)} cached)`
    : `${formatTokens(tokens.total)} tokens`;

  consoleLog(
    sessionId,
    '📥',
    `${colors.magenta}LLM Response${colors.reset} ← ${responseDesc}`,
    `${tokenInfo} | ${formatCost(costCents)} | ${formatDuration(durationMs || 0)}`
  );

  // Store raw response plus calculated fields needed for session totals
  return await logEvent(sessionId, 'llm_response', {
    raw_response: rawResponse,
    tokens,
    cost_cents: costCents
  }, durationMs);
}

/**
 * Log a tool call
 * @param {string} sessionId - Session UUID
 * @param {string} toolName - Tool being called
 * @param {Object} args - Tool arguments
 * @param {string} callId - Unique call ID
 */
async function logToolCall(sessionId, toolName, args, callId = null) {
  const argsPreview = JSON.stringify(args).substring(0, 60);
  
  consoleLog(
    sessionId,
    '🔧',
    `${colors.yellow}Tool Call${colors.reset} → ${toolName}`,
    `${truncate(argsPreview, 50)}`
  );

  return await logEvent(sessionId, 'tool_call', {
    tool_name: toolName,
    arguments: args,
    call_id: callId || `call_${Date.now()}`
  });
}

/**
 * Log a tool result
 * @param {string} sessionId - Session UUID
 * @param {string} toolName - Tool that was called
 * @param {*} result - Tool result
 * @param {boolean} success - Whether tool succeeded
 * @param {string} callId - Matching call ID
 * @param {number} durationMs - Execution duration
 */
async function logToolResult(sessionId, toolName, result, success = true, callId = null, durationMs = null) {
  const icon = success ? '✓' : '✗';
  const color = success ? colors.green : colors.red;
  
  let resultPreview = '';
  if (typeof result === 'string') {
    resultPreview = truncate(result, 50);
  } else if (result && typeof result === 'object') {
    resultPreview = truncate(JSON.stringify(result), 50);
  }

  consoleLog(
    sessionId,
    '🔧',
    `${colors.yellow}Tool Result${colors.reset} ← ${toolName}: ${color}${icon}${colors.reset}`,
    durationMs ? `${formatDuration(durationMs)}` : ''
  );

  return await logEvent(sessionId, 'tool_result', {
    tool_name: toolName,
    result,
    success,
    call_id: callId
  }, durationMs);
}

/**
 * Log an error
 * @param {string} sessionId - Session UUID
 * @param {Error|string} error - Error object or message
 * @param {string} context - Context where error occurred
 * @param {Object} details - Additional structured details for debugging
 */
async function logError(sessionId, error, context = null, details = null) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;

  consoleLog(
    sessionId,
    '❌',
    `${colors.red}Error${colors.reset}`,
    `${message}${context ? ` (${context})` : ''}`
  );

  return await logEvent(sessionId, 'error', {
    message,
    stack,
    context,
    details
  });
}

/**
 * Log a knowledge injection (from initializer agent)
 * @param {string} sessionId - Session UUID
 * @param {string} source - Data source identifier
 * @param {string} data - Knowledge data (usually XML formatted)
 */
async function logKnowledge(sessionId, source, data) {
  consoleLog(
    sessionId,
    '📚',
    `${colors.blue}Knowledge${colors.reset} ← ${source}`,
    `${truncate(data, 40)}`
  );

  return await logEvent(sessionId, 'knowledge', {
    source,
    data
  });
}

/**
 * Generate a short, LLM-friendly ID (8 alphanumeric characters)
 */
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Log an artifact event
 * Artifacts are structured outputs (workouts, reports, etc.) that can be delivered to the client
 * @param {string} sessionId - Session UUID
 * @param {Object} artifact - Artifact object
 * @param {string} artifact.type - Artifact type (e.g., 'exercise_list')
 * @param {string} artifact.title - Human-readable title
 * @param {Object} artifact.summary - Summary information for display
 * @param {boolean} artifact.auto_start - Whether to auto-start (for timers)
 * @param {Object} artifact.payload - Full artifact payload data
 * @returns {Object} Object with event and artifact_id
 */
async function logArtifact(sessionId, artifact) {
  // Generate short artifact ID if not provided (e.g., "art_x7k2m9p4")
  const artifactId = artifact.artifact_id || `art_${generateShortId()}`;

  consoleLog(
    sessionId,
    '📦',
    `${colors.blue}Artifact${colors.reset} ← ${artifact.type}`,
    `"${truncate(artifact.title, 40)}"`
  );

  const artifactData = {
    artifact_id: artifactId,
    type: artifact.type,
    schema_version: artifact.schema_version || '1.0',
    title: artifact.title,
    summary: artifact.summary,
    auto_start: artifact.auto_start || false,
    payload: artifact.payload
  };

  const event = await logEvent(sessionId, 'artifact', artifactData);

  return { event, artifact_id: artifactId };
}

/**
 * Get artifact by ID from session events
 * @param {string} sessionId - Session UUID
 * @param {string} artifactId - Artifact ID to retrieve
 * @returns {Object|null} Artifact data or null if not found
 */
async function getArtifact(sessionId, artifactId) {
  const { data, error } = await supabase
    .from('agent_session_events')
    .select('data')
    .eq('session_id', sessionId)
    .eq('event_type', 'artifact')
    .filter('data->>artifact_id', 'eq', artifactId)
    .single();

  if (error || !data) return null;
  return data.data;
}

// =============================================================================
// EVENT RETRIEVAL
// =============================================================================

/**
 * Get full session timeline (all events)
 * @param {string} sessionId - Session UUID
 * @returns {Array} Events in chronological order
 */
async function getSessionTimeline(sessionId) {
  const { data, error } = await supabase
    .from('agent_session_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get events for context building (user_message, tool_call, tool_result, knowledge, artifact)
 * @param {string} sessionId - Session UUID
 * @param {number} fromSequence - Start from this sequence
 * @returns {Array} Context-relevant events
 */
async function getContextEvents(sessionId, fromSequence = 0) {
  const { data, error } = await supabase
    .from('agent_session_events')
    .select('*')
    .eq('session_id', sessionId)
    .gte('sequence_number', fromSequence)
    .in('event_type', ['user_message', 'tool_call', 'tool_result', 'knowledge', 'artifact'])
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get session with summary stats
 * @param {string} sessionId - Session UUID
 * @returns {Object} Session with event counts
 */
async function getSessionWithStats(sessionId) {
  const { data, error } = await supabase
    .from('agent_session_summaries')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Session management
  createSession,
  getOrCreateSession,
  getSession,
  endSession,
  updateContextStart,
  getUserSessions,

  // Event logging
  logEvent,
  logUserMessage,
  logLLMRequest,
  logLLMResponse,
  logToolCall,
  logToolResult,
  logError,
  logKnowledge,
  logArtifact,
  getArtifact,

  // Event retrieval
  getSessionTimeline,
  getContextEvents,
  getSessionWithStats,

  // Utilities (for external use)
  formatTokens,
  formatCost,
  formatDuration,
  consoleLog
};
