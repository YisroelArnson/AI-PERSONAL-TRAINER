const { appendEpisodicNoteBlock } = require('./memory-docs.service');
const { appendSessionEvent } = require('./transcript-write.service');
const { getDateKeyInTimezone } = require('./timezone-date.service');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const SESSION_MEMORY_MARKER_PREFIX = 'session-memory-flush';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function buildSessionMemoryMarker(sessionId) {
  return `<!-- ${SESSION_MEMORY_MARKER_PREFIX}:${sessionId} -->`;
}

function normalizeSessionMemoryMessageCount(value) {
  return Math.max(1, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 15);
}

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

function toSessionMemoryEntry(event) {
  const payload = event.payload || {};

  return {
    role: event.actor,
    text: String(payload.text || payload.message || '').trim(),
    occurredAt: event.occurred_at
  };
}

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

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

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

async function flushSessionMemoryToEpisodicDate({
  userId,
  sessionKey,
  previousSessionId,
  rotationReason,
  timezone,
  messageCount
}) {
  const effectiveMessageCount = normalizeSessionMemoryMessageCount(messageCount);
  const recentEvents = await listRecentSessionEventsForFlush({
    userId,
    sessionKey,
    sessionId: previousSessionId,
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
      previousSessionId
    };
  }

  const endedAt = entries[entries.length - 1].occurredAt || new Date().toISOString();
  const dateKey = getDateKeyInTimezone(endedAt, timezone);
  const markdownBlock = buildSessionExcerptMarkdown({
    sessionKey,
    sessionId: previousSessionId,
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
        rotationReason
      },
      occurredAt: endedAt,
      idempotencyKey: `memory.flush_session_end:${previousSessionId}`
    });
  } catch (error) {
    console.warn('Unable to append memory.flush.executed audit event:', error.message);
  }

  return {
    status: appendResult.status || 'updated',
    previousSessionId,
    dateKey,
    docKey: `EPISODIC_DATE:${dateKey}`,
    messageCount: entries.length,
    changed: appendResult.changed !== false
  };
}

module.exports = {
  buildSessionExcerptMarkdown,
  buildSessionMemoryMarker,
  flushSessionMemoryToEpisodicDate,
  normalizeSessionMemoryMessageCount,
  shouldIncludeSessionMemoryEvent
};
