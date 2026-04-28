/**
 * File overview:
 * Implements runtime service logic for session compaction.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - readInMemoryDebounce: Reads In memory debounce from its source.
 * - writeInMemoryDebounce: Writes In memory debounce to its destination.
 * - shouldSuppressCompactionEnqueue: Handles Should suppress compaction enqueue for session-compaction.service.js.
 * - getSessionState: Gets Session state needed by this file.
 * - isVisibleCompactionMessage: Handles Is visible compaction message for session-compaction.service.js.
 * - getSessionCompactionSnapshot: Gets Session compaction snapshot needed by this file.
 * - isSessionCompactionEligible: Handles Is session compaction eligible for session-compaction.service.js.
 * - buildCompactionSummaryPayload: Builds a Compaction summary payload used by this file.
 * - enqueueSessionCompactionIfNeeded: Enqueues Session compaction if needed for asynchronous work.
 * - flushPreCompactionMemory: Flushes Pre compaction memory when buffered work needs to be emitted.
 * - compactSession: Compacts Session to keep the session manageable.
 */

const { env } = require('../../config/env');
const {
  enqueueSessionCompaction,
  enqueueSessionIndexSync
} = require('../../infra/queue/agent.queue');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { resolveSessionContinuityPolicy } = require('./session-reset-policy.service');
const { listTranscriptEventsForSession } = require('./transcript-read.service');

const inMemoryDebounceCache = new Map();

function getSessionMemoryFlushService() {
  return require('./session-memory-flush.service');
}

function getTranscriptWriteService() {
  return require('./transcript-write.service');
}

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Reads In memory debounce from its source.
 */
function readInMemoryDebounce(key) {
  const cached = inMemoryDebounceCache.get(key);

  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    inMemoryDebounceCache.delete(key);
    return false;
  }

  return true;
}

/**
 * Writes In memory debounce to its destination.
 */
function writeInMemoryDebounce(key, ttlMs) {
  if (ttlMs <= 0) {
    return;
  }

  inMemoryDebounceCache.set(key, {
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Handles Should suppress compaction enqueue for session-compaction.service.js.
 */
async function shouldSuppressCompactionEnqueue(key, ttlMs) {
  const redis = getRedisConnection();

  if (redis) {
    const cacheHit = await redis.get(key);

    if (cacheHit) {
      return true;
    }

    if (ttlMs > 0) {
      await redis.set(key, '1', 'PX', ttlMs);
    }

    return false;
  }

  if (readInMemoryDebounce(key)) {
    return true;
  }

  writeInMemoryDebounce(key, ttlMs);
  return false;
}

/**
 * Gets Session state needed by this file.
 */
async function getSessionState({ userId, sessionKey }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_state')
    .select('*')
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Handles Is visible compaction message for session-compaction.service.js.
 */
function isVisibleCompactionMessage(event) {
  if (!event) {
    return false;
  }

  if (event.event_type === 'compaction.summary') {
    return true;
  }

  if (!['user', 'assistant'].includes(event.actor)) {
    return false;
  }

  const payload = event.payload || {};
  return Boolean(String(payload.text || payload.message || '').trim());
}

/**
 * Gets Session compaction snapshot needed by this file.
 */
async function getSessionCompactionSnapshot({ userId, sessionKey, sessionId }) {
  const [state, events] = await Promise.all([
    getSessionState({
      userId,
      sessionKey
    }),
    listTranscriptEventsForSession({
      userId,
      sessionKey,
      sessionId
    })
  ]);
  const totalEventCount = Array.isArray(events) ? events.length : 0;
  const visibleMessageCount = (events || []).filter(isVisibleCompactionMessage).length;
  const currentCompactionCount = Number(state && state.compaction_count ? state.compaction_count : 0);

  return {
    state,
    events,
    totalEventCount,
    visibleMessageCount,
    currentCompactionCount,
    nextCompactionCount: currentCompactionCount + 1
  };
}

/**
 * Handles Is session compaction eligible for session-compaction.service.js.
 */
function isSessionCompactionEligible(snapshot) {
  if (!snapshot || !snapshot.state) {
    return false;
  }

  return snapshot.totalEventCount >= (snapshot.nextCompactionCount * env.sessionCompactionMinEventCount)
    && snapshot.visibleMessageCount >= (snapshot.nextCompactionCount * env.sessionCompactionMinMessageCount);
}

/**
 * Builds a Compaction summary payload used by this file.
 */
function buildCompactionSummaryPayload({
  sessionKey,
  sessionId,
  nextCompactionCount,
  events
}) {
  const safeEvents = Array.isArray(events) ? events : [];
  const visibleMessages = safeEvents.filter(isVisibleCompactionMessage);
  const lastVisibleMessages = visibleMessages.slice(-6).map(event => {
    const payload = event.payload || {};
    const text = String(payload.text || payload.message || payload.summary || '').trim();
    const label = event.event_type === 'compaction.summary'
      ? 'summary'
      : event.actor;

    return `${label}: ${text}`;
  });
  const firstSeqNum = safeEvents.length > 0 ? safeEvents[0].seq_num : 0;
  const lastSeqNum = safeEvents.length > 0 ? safeEvents[safeEvents.length - 1].seq_num : 0;
  const summary = [
    `Compaction cycle ${nextCompactionCount} for ${sessionKey}.`,
    `Session ${sessionId} currently contains ${safeEvents.length} total events and ${visibleMessages.length} visible messages.`,
    lastVisibleMessages.length > 0
      ? 'Recent visible transcript:\n' + lastVisibleMessages.map(line => `- ${line}`).join('\n')
      : 'Recent visible transcript:\n- none'
  ].join('\n');

  return {
    summary,
    sourceEventCount: safeEvents.length,
    visibleMessageCount: visibleMessages.length,
    sourceSeqStart: firstSeqNum,
    sourceSeqEnd: lastSeqNum,
    compactionCount: nextCompactionCount
  };
}

/**
 * Enqueues Session compaction if needed for asynchronous work.
 */
async function enqueueSessionCompactionIfNeeded({ userId, sessionKey, sessionId }) {
  if (!userId || !sessionKey || !sessionId) {
    return null;
  }

  const snapshot = await getSessionCompactionSnapshot({
    userId,
    sessionKey,
    sessionId
  });

  if (!isSessionCompactionEligible(snapshot)) {
    return null;
  }

  const shouldSkip = await shouldSuppressCompactionEnqueue(
    `compaction:${userId}:${sessionKey}:${sessionId}:${snapshot.nextCompactionCount}`,
    env.sessionCompactionDebounceMs
  );

  if (shouldSkip) {
    return null;
  }

  return enqueueSessionCompaction({
    userId,
    sessionKey,
    sessionId,
    nextCompactionCount: snapshot.nextCompactionCount,
    delayMs: env.sessionCompactionDebounceMs
  });
}

/**
 * Flushes Pre compaction memory when buffered work needs to be emitted.
 */
async function flushPreCompactionMemory({
  userId,
  sessionKey,
  sessionId,
  timezone,
  messageCount,
  currentCompactionCount
}) {
  const { flushSessionMemoryToEpisodicDate } = getSessionMemoryFlushService();

  return flushSessionMemoryToEpisodicDate({
    userId,
    sessionKey,
    sessionId,
    timezone,
    messageCount,
    flushKind: 'pre_compaction',
    currentCompactionCount,
    updateSessionState: true
  });
}

/**
 * Compacts Session to keep the session manageable.
 */
async function compactSession({
  userId,
  sessionKey,
  sessionId,
  nextCompactionCount
}) {
  const snapshot = await getSessionCompactionSnapshot({
    userId,
    sessionKey,
    sessionId
  });

  if (!snapshot.state) {
    return {
      status: 'skipped',
      reason: 'missing_state'
    };
  }

  if (snapshot.nextCompactionCount !== nextCompactionCount) {
    return {
      status: 'skipped',
      reason: 'stale_compaction_count',
      currentCompactionCount: snapshot.currentCompactionCount,
      nextCompactionCount: snapshot.nextCompactionCount
    };
  }

  if (!isSessionCompactionEligible(snapshot)) {
    return {
      status: 'skipped',
      reason: 'not_eligible',
      totalEventCount: snapshot.totalEventCount,
      visibleMessageCount: snapshot.visibleMessageCount
    };
  }

  const continuityPolicy = await resolveSessionContinuityPolicy(userId);

  if (Number(snapshot.state.memory_flush_compaction_count || 0) < nextCompactionCount) {
    await flushPreCompactionMemory({
      userId,
      sessionKey,
      sessionId,
      timezone: continuityPolicy.timezone,
      messageCount: continuityPolicy.sessionMemoryMessageCount,
      currentCompactionCount: nextCompactionCount
    });
  }

  const summaryPayload = buildCompactionSummaryPayload({
    sessionKey,
    sessionId,
    nextCompactionCount,
    events: snapshot.events
  });
  const { appendSessionEvent } = getTranscriptWriteService();

  await appendSessionEvent({
    userId,
    sessionKey,
    sessionId,
    eventType: 'compaction.summary',
    actor: 'system',
    payload: summaryPayload,
    idempotencyKey: `compaction.summary:${sessionId}:${nextCompactionCount}`
  });

  const supabase = getAdminClientOrThrow();
  const { error } = await supabase
    .from('session_state')
    .update({
      compaction_count: nextCompactionCount
    })
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .lt('compaction_count', nextCompactionCount);

  if (error) {
    throw error;
  }

  await enqueueSessionIndexSync({
    userId,
    sessionKey,
    sessionId,
    mode: 'immediate',
    delayMs: 0
  });

  return {
    status: 'compacted',
    sessionId,
    sessionKey,
    nextCompactionCount,
    summary: summaryPayload.summary
  };
}

module.exports = {
  buildCompactionSummaryPayload,
  compactSession,
  enqueueSessionCompactionIfNeeded,
  flushPreCompactionMemory,
  getSessionCompactionSnapshot,
  getSessionState,
  isSessionCompactionEligible
};
