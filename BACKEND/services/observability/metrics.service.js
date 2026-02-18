// BACKEND/services/observability/metrics.service.js
// Metrics aggregation service for dashboard queries
// Queries the unified agent_session_events table

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function getUserSessionIds(userId, options = {}) {
  const { startDate, endDate } = options;

  let query = supabase
    .from('agent_sessions')
    .select('id')
    .eq('user_id', userId);

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => row.id);
}

function sanitizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function sanitizeOffset(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Get summary metrics for the dashboard
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user (optional)
 * @param {string} options.startDate - Start date (ISO string)
 * @param {string} options.endDate - End date (ISO string)
 * @returns {Object} Summary metrics
 */
async function getSummaryMetrics(options = {}) {
  const { userId, startDate, endDate } = options;
  
  // Get sessions
  let sessionQuery = supabase
    .from('agent_sessions')
    .select('id, total_tokens, cached_tokens, total_cost_cents, status, created_at');
  
  if (userId) {
    sessionQuery = sessionQuery.eq('user_id', userId);
  }
  
  if (startDate) {
    sessionQuery = sessionQuery.gte('created_at', startDate);
  }
  
  if (endDate) {
    sessionQuery = sessionQuery.lte('created_at', endDate);
  }
  
  const { data: sessions, error: sessionsError } = await sessionQuery;
  
  if (sessionsError) throw sessionsError;
  
  const sessionIds = sessions.map(session => session.id);
  let events = [];

  if (!userId || sessionIds.length > 0) {
    // Get LLM response events for detailed metrics
    let eventsQuery = supabase
      .from('agent_session_events')
      .select('session_id, event_type, data, duration_ms, timestamp')
      .eq('event_type', 'llm_response');

    if (userId) {
      eventsQuery = eventsQuery.in('session_id', sessionIds);
    }

    if (startDate) {
      eventsQuery = eventsQuery.gte('timestamp', startDate);
    }

    if (endDate) {
      eventsQuery = eventsQuery.lte('timestamp', endDate);
    }

    const { data: eventRows, error: eventsError } = await eventsQuery;
    if (eventsError) throw eventsError;
    events = eventRows || [];
  }
  
  // Calculate aggregates from sessions
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const errorSessions = sessions.filter(s => s.status === 'error');
  
  const totalSessions = sessions.length;
  const successfulSessions = completedSessions.length;
  const failedSessions = errorSessions.length;
  const errorRate = totalSessions > 0 ? (failedSessions / totalSessions) * 100 : 0;
  
  const totalTokens = sessions.reduce((sum, s) => sum + (s.total_tokens || 0), 0);
  const cachedTokens = sessions.reduce((sum, s) => sum + (s.cached_tokens || 0), 0);
  const totalCostCents = sessions.reduce((sum, s) => sum + parseFloat(s.total_cost_cents || 0), 0);
  
  // Calculate latency from LLM response events
  const durations = events
    .map(e => e.duration_ms)
    .filter(d => d != null);
  
  const avgLatencyMs = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  
  const p50LatencyMs = percentile(durations, 50);
  const p95LatencyMs = percentile(durations, 95);
  const p99LatencyMs = percentile(durations, 99);
  
  // Count total LLM calls
  const totalLLMCalls = events.length;
  
  return {
    totalSessions,
    successfulSessions,
    failedSessions,
    errorRate: Math.round(errorRate * 100) / 100,
    totalTokens,
    cachedTokens,
    cacheHitRate: totalTokens > 0 ? Math.round((cachedTokens / totalTokens) * 10000) / 100 : 0,
    totalCostCents: Math.round(totalCostCents * 100) / 100,
    totalCostUsd: Math.round(totalCostCents) / 100,
    totalLLMCalls,
    avgLatencyMs: Math.round(avgLatencyMs),
    p50LatencyMs: Math.round(p50LatencyMs),
    p95LatencyMs: Math.round(p95LatencyMs),
    p99LatencyMs: Math.round(p99LatencyMs)
  };
}

/**
 * Get token usage over time
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user (optional)
 * @param {string} options.startDate - Start date
 * @param {string} options.endDate - End date
 * @param {string} options.granularity - 'hour', 'day', 'week' (default: 'day')
 * @returns {Array} Token usage data points
 */
async function getTokenUsageOverTime(options = {}) {
  const { userId, startDate, endDate, granularity = 'day' } = options;

  let sessionIds = null;
  if (userId) {
    sessionIds = await getUserSessionIds(userId, { startDate, endDate });
    if (sessionIds.length === 0) {
      return [];
    }
  }
  
  // Get LLM response events
  let query = supabase
    .from('agent_session_events')
    .select('timestamp, data')
    .eq('event_type', 'llm_response')
    .order('timestamp', { ascending: true });

  if (sessionIds) {
    query = query.in('session_id', sessionIds);
  }
  
  if (startDate) {
    query = query.gte('timestamp', startDate);
  }
  
  if (endDate) {
    query = query.lte('timestamp', endDate);
  }
  
  const { data: events, error } = await query;
  
  if (error) throw error;
  
  // Group by time bucket
  const buckets = new Map();
  
  for (const event of events) {
    const bucket = getTimeBucket(event.timestamp, granularity);
    
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { tokens: 0, cached: 0, cost_cents: 0, count: 0 });
    }
    
    const data = buckets.get(bucket);
    const tokens = event.data?.tokens || {};
    data.tokens += tokens.total || 0;
    data.cached += tokens.cached || 0;
    data.cost_cents += parseFloat(event.data?.cost_cents || 0);
    data.count += 1;
  }
  
  // Convert to array
  return Array.from(buckets.entries()).map(([timestamp, data]) => ({
    timestamp,
    tokens: data.tokens,
    cached_tokens: data.cached,
    cost_cents: Math.round(data.cost_cents * 100) / 100,
    request_count: data.count
  }));
}

/**
 * Get tool analytics (frequency, success rate, latency)
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user (optional)
 * @param {string} options.startDate - Start date
 * @param {string} options.endDate - End date
 * @returns {Array} Tool analytics data
 */
async function getToolAnalytics(options = {}) {
  const { userId, startDate, endDate } = options;

  let sessionIds = null;
  if (userId) {
    sessionIds = await getUserSessionIds(userId, { startDate, endDate });
    if (sessionIds.length === 0) {
      return [];
    }
  }
  
  // Get tool result events
  let query = supabase
    .from('agent_session_events')
    .select('data, duration_ms')
    .eq('event_type', 'tool_result');

  if (sessionIds) {
    query = query.in('session_id', sessionIds);
  }
  
  if (startDate) {
    query = query.gte('timestamp', startDate);
  }
  
  if (endDate) {
    query = query.lte('timestamp', endDate);
  }
  
  const { data: events, error } = await query;
  
  if (error) throw error;
  
  // Group by tool name
  const toolStats = new Map();
  
  for (const event of events) {
    const toolName = event.data?.tool_name;
    if (!toolName) continue;
    
    if (!toolStats.has(toolName)) {
      toolStats.set(toolName, {
        tool_name: toolName,
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        durations: []
      });
    }
    
    const stats = toolStats.get(toolName);
    stats.total_calls += 1;
    
    if (event.data?.success) {
      stats.successful_calls += 1;
    } else {
      stats.failed_calls += 1;
    }
    
    if (event.duration_ms != null) {
      stats.durations.push(event.duration_ms);
    }
  }
  
  // Calculate final stats
  return Array.from(toolStats.values())
    .map(stats => ({
      tool_name: stats.tool_name,
      total_calls: stats.total_calls,
      successful_calls: stats.successful_calls,
      failed_calls: stats.failed_calls,
      success_rate: stats.total_calls > 0 
        ? Math.round((stats.successful_calls / stats.total_calls) * 10000) / 100 
        : 0,
      avg_duration_ms: stats.durations.length > 0 
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length) 
        : null,
      p50_duration_ms: Math.round(percentile(stats.durations, 50)),
      p95_duration_ms: Math.round(percentile(stats.durations, 95))
    }))
    .sort((a, b) => b.total_calls - a.total_calls);
}

/**
 * Get latency distribution
 * @param {Object} options - Query options
 * @returns {Object} Latency distribution data
 */
async function getLatencyDistribution(options = {}) {
  const { userId, startDate, endDate } = options;

  let sessionIds = null;
  if (userId) {
    sessionIds = await getUserSessionIds(userId, { startDate, endDate });
    if (sessionIds.length === 0) {
      return {
        by_event_type: {
          llm_response: { count: 0, avg: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0 },
          tool_result: { count: 0, avg: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0 }
        }
      };
    }
  }
  
  // Get LLM response and tool result events
  let query = supabase
    .from('agent_session_events')
    .select('event_type, data, duration_ms')
    .in('event_type', ['llm_response', 'tool_result']);

  if (sessionIds) {
    query = query.in('session_id', sessionIds);
  }
  
  if (startDate) {
    query = query.gte('timestamp', startDate);
  }
  
  if (endDate) {
    query = query.lte('timestamp', endDate);
  }
  
  const { data: events, error } = await query;
  
  if (error) throw error;
  
  // Group by event type
  const latencies = {
    llm_response: [],
    tool_result: []
  };
  
  for (const event of events) {
    if (event.duration_ms != null && latencies[event.event_type]) {
      latencies[event.event_type].push(event.duration_ms);
    }
  }
  
  // Calculate distribution for each type
  const distribution = {
    by_event_type: {}
  };
  
  for (const [type, durations] of Object.entries(latencies)) {
    distribution.by_event_type[type] = {
      count: durations.length,
      avg: Math.round(average(durations)),
      p50: Math.round(percentile(durations, 50)),
      p75: Math.round(percentile(durations, 75)),
      p90: Math.round(percentile(durations, 90)),
      p95: Math.round(percentile(durations, 95)),
      p99: Math.round(percentile(durations, 99)),
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0
    };
  }
  
  return distribution;
}

/**
 * Get recent sessions with pagination
 * @param {Object} options - Query options
 * @param {string} options.userId - Filter by user (optional)
 * @param {string} options.status - Filter by status (optional)
 * @param {number} options.limit - Number of results (default: 50)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @returns {Object} Sessions and total count
 */
async function getRecentSessions(options = {}) {
  const { userId, status, limit = 50, offset = 0 } = options;
  const safeLimit = sanitizeLimit(limit, 50, 200);
  const safeOffset = sanitizeOffset(offset, 0);
  
  let query = supabase
    .from('agent_sessions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error, count } = await query;
  
  if (error) throw error;
  
  return {
    sessions: data || [],
    total: count || 0,
    limit: safeLimit,
    offset: safeOffset
  };
}

/**
 * Get session details with full event timeline
 * @param {string} sessionId - Session UUID
 * @returns {Object} Session with events
 */
async function getSessionDetails(sessionId) {
  // Get session
  const { data: session, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  
  if (sessionError) throw sessionError;
  
  // Get all events for the session
  const { data: events, error: eventsError } = await supabase
    .from('agent_session_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true });
  
  if (eventsError) throw eventsError;
  
  return {
    ...session,
    events: events || []
  };
}

/**
 * Get session timeline (events only)
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate percentile from array of numbers
 * @param {Array} arr - Array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number} Percentile value
 */
function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate average from array of numbers
 * @param {Array} arr - Array of numbers
 * @returns {number} Average value
 */
function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Get time bucket for a timestamp
 * @param {string} timestamp - ISO timestamp
 * @param {string} granularity - 'hour', 'day', 'week'
 * @returns {string} Bucket timestamp
 */
function getTimeBucket(timestamp, granularity) {
  const date = new Date(timestamp);
  
  switch (granularity) {
    case 'hour':
      date.setMinutes(0, 0, 0);
      break;
    case 'day':
      date.setHours(0, 0, 0, 0);
      break;
    case 'week':
      const day = date.getDay();
      date.setDate(date.getDate() - day);
      date.setHours(0, 0, 0, 0);
      break;
    default:
      date.setHours(0, 0, 0, 0);
  }
  
  return date.toISOString();
}

module.exports = {
  getSummaryMetrics,
  getTokenUsageOverTime,
  getToolAnalytics,
  getLatencyDistribution,
  getRecentSessions,
  getSessionDetails,
  getSessionTimeline
};
