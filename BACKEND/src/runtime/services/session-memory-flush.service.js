/**
 * File overview:
 * Implements runtime service logic for session memory flush.
 *
 * Main functions in this file:
 * - buildSessionMemoryMarker: Builds a Session memory marker used by this file.
 * - normalizeSessionMemoryMessageCount: Normalizes Session memory message count into the format this file expects.
 * - shouldIncludeSessionMemoryEvent: Handles Should include session memory event for session-memory-flush.service.js.
 * - toSessionMemoryEntry: Handles To session memory entry for session-memory-flush.service.js.
 * - buildSessionExcerptMarkdown: Builds a Session excerpt markdown used by this file.
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - listRecentSessionEventsForFlush: Lists Recent session events for flush for the caller.
 * - flushSessionMemoryToEpisodicDate: Flushes Session memory to episodic date when buffered work needs to be emitted.
 */

const { appendEpisodicNoteBlock } = require('./memory-docs.service');
const { appendSessionEvent } = require('./transcript-write.service');
const { getDateKeyInTimezone } = require('./timezone-date.service');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const SESSION_MEMORY_MARKER_PREFIX = 'session-memory-flush';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Builds a Session memory marker used by this file.
 */
function buildSessionMemoryMarker(sessionId) {
  return `<!-- ${SESSION_MEMORY_MARKER_PREFIX}:${sessionId} -->`;
}

/**
 * Normalizes Session memory message count into the format this file expects.
 */
function normalizeSessionMemoryMessageCount(value) {
  return Math.max(1, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 15);
}

/**
 * Handles Should include session memory event for session-memory-flush.service.js.
 */
function shouldIncludeSessionMemoryEvent(event) {
  const payload = event && event.payload ? event.payload : {};
  const metadata = payload.metadata || {};
  const text = payload.text || payload.message || '';

  if (!event || !['user', 'assistant'].includes(event.actor)) {
    return false;
  }

  if (!String(text || '').trim()) {
    return false;
  }

  if (event.event_type === 'app.opened') {
    return false;
  }

  if (metadata.hiddenInFeed === true || metadata.interSessionProvenance === true) {
    return false;
  }

  if (event.actor === 'user' && String(text).trim().startsWith('/')) {
    return false;
  }

  return true;
}

/**
 * Handles To session memory entry for session-memory-flush.service.js.
 */
function toSessionMemoryEntry(event) {
  const payload = event.payload || {};

  return {
    role: event.actor,
    text: String(payload.text || payload.message || '').trim(),
    occurredAt: event.occurred_at
  };
}

/**
 * Builds a Session excerpt markdown used by this file.
 */
function buildSessionExcerptMarkdown({
  sessionKey,
  sessionId,
  endedAt,
  rotationReason,
  entries
}) {
  const marker = buildSessionMemoryMarker(sessionId);
  const lines = [
    marker,
    '## Session Excerpt',
    '',
    `- **Session Key**: ${sessionKey}`,
    `- **Session ID**: ${sessionId}`
  ];

  if (endedAt) {
    lines.push(`- **Ended At**: ${endedAt}`);
  }

  if (rotationReason) {
    lines.push(`- **Rotation Reason**: ${rotationReason}`);
  }

  lines.push('', '### Messages', '');

  for (const entry of entries) {
    lines.push(`${entry.role}: ${entry.text}`);
  }

  return lines.join('\n');
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
 * Lists Recent session events for flush for the caller.
 */
async function listRecentSessionEventsForFlush({
  userId,
  sessionKey,
  sessionId,
  messageCount
}) {
  const supabase = getAdminClientOrThrow();
  let from = 0;
  let page = 0;
  const events = [];

  while (page < MAX_PAGES) {
    const { data, error } = await supabase
      .from('session_events')
      .select('*')
      .eq('user_id', userId)
      .eq('session_key', sessionKey)
      .eq('session_id', sessionId)
      .order('seq_num', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    events.push(...data);

    if (events.filter(shouldIncludeSessionMemoryEvent).length >= messageCount || data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
    page += 1;
  }

  return [...events].reverse();
}

/**
 * Flushes Session memory to episodic date when buffered work needs to be emitted.
 */
async function flushSessionMemoryToEpisodicDate({
  userId,
  sessionKey,
  sessionId,
  previousSessionId,
  rotationReason,
  timezone,
  messageCount,
  flushKind = 'session_end',
  currentCompactionCount = null,
  updateSessionState = false
}) {
  const targetSessionId = sessionId || previousSessionId;

  if (!targetSessionId) {
    return {
      status: 'skipped',
      reason: 'missing_session_id'
    };
  }

  const effectiveMessageCount = normalizeSessionMemoryMessageCount(messageCount);
  const recentEvents = await listRecentSessionEventsForFlush({
    userId,
    sessionKey,
    sessionId: targetSessionId,
    messageCount: effectiveMessageCount
  });
  const entries = recentEvents
    .filter(shouldIncludeSessionMemoryEvent)
    .map(toSessionMemoryEntry)
    .slice(-effectiveMessageCount);

  if (entries.length === 0) {
    return {
      status: 'skipped',
      reason: 'no_visible_messages',
      previousSessionId: targetSessionId
    };
  }

  const endedAt = entries[entries.length - 1].occurredAt || new Date().toISOString();
  const dateKey = getDateKeyInTimezone(endedAt, timezone);
  const markdownBlock = buildSessionExcerptMarkdown({
    sessionKey,
    sessionId: targetSessionId,
    endedAt,
    rotationReason,
    entries
  });
  const appendResult = await appendEpisodicNoteBlock({
    userId,
    dateKey,
    markdownBlock,
    updatedByActor: 'system',
    updatedByRunId: null
  });

  try {
    await appendSessionEvent({
      userId,
      sessionKey,
      sessionId: previousSessionId,
      eventType: 'memory.flush.executed',
      actor: 'system',
      payload: {
        dateKey,
        docKey: `EPISODIC_DATE:${dateKey}`,
        messageCount: entries.length,
        rotationReason,
        flushKind,
        currentCompactionCount
      },
      occurredAt: endedAt,
      idempotencyKey: flushKind === 'pre_compaction'
        ? `memory.flush_pre_compaction:${targetSessionId}:${currentCompactionCount || 1}`
        : `memory.flush_session_end:${targetSessionId}`
    });
  } catch (error) {
    console.warn('Unable to append memory.flush.executed audit event:', error.message);
  }

  if (updateSessionState) {
    const supabase = getAdminClientOrThrow();
    const patch = {
      memory_flush_at: new Date().toISOString()
    };

    if (currentCompactionCount != null) {
      patch.memory_flush_compaction_count = currentCompactionCount;
    }

    const { error: stateError } = await supabase
      .from('session_state')
      .update(patch)
      .eq('user_id', userId)
      .eq('session_key', sessionKey);

    if (stateError) {
      throw stateError;
    }
  }

  return {
    status: appendResult.status || 'updated',
    previousSessionId: targetSessionId,
    dateKey,
    docKey: `EPISODIC_DATE:${dateKey}`,
    messageCount: entries.length,
    changed: appendResult.changed !== false,
    flushKind,
    currentCompactionCount
  };
}

module.exports = {
  buildSessionExcerptMarkdown,
  buildSessionMemoryMarker,
  flushSessionMemoryToEpisodicDate,
  normalizeSessionMemoryMessageCount,
  shouldIncludeSessionMemoryEvent
};
