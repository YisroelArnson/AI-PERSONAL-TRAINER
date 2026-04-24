/**
 * File overview:
 * Implements runtime service logic for transcript read.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - hasAssistantEventForRun: Handles Has assistant event for run for transcript-read.service.js.
 * - reorderRunAttachedToolResults: Reorders Run attached tool results into transcript position.
 * - loadStreamedAssistantTextByRunId: Loads Streamed assistant text by run ID for the surrounding workflow.
 * - hydrateMissingAssistantTurns: Hydrates Missing assistant turns before prompt context is built.
 * - listRecentTranscriptEventsForRun: Lists Recent transcript events for run for the caller.
 * - listTranscriptEventsForSession: Lists Transcript events for session for the caller.
 * - toRuntimeMessages: Handles To runtime messages for transcript-read.service.js.
 */

const { getSupabaseAdminClient } = require('../../infra/supabase/client');

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
 * Handles Has assistant event for run for transcript-read.service.js.
 */
function hasAssistantEventForRun(events, runId) {
  return events.some(event => (
    event
    && event.actor === 'assistant'
    && event.run_id === runId
  ));
}

/**
 * Reorders Run attached tool results into transcript position.
 */
function reorderRunAttachedToolResults(events) {
  const orderedEvents = Array.isArray(events) ? events : [];
  const toolResultsByRunId = new Map();
  const toolResultEventIds = new Set();

  for (const event of orderedEvents) {
    if (
      event
      && event.actor === 'tool'
      && event.event_type === 'tool.result'
      && event.run_id
    ) {
      if (!toolResultsByRunId.has(event.run_id)) {
        toolResultsByRunId.set(event.run_id, []);
      }

      toolResultsByRunId.get(event.run_id).push(event);

      if (event.event_id) {
        toolResultEventIds.add(event.event_id);
      }
    }
  }

  if (toolResultsByRunId.size === 0) {
    return orderedEvents;
  }

  const reorderedEvents = [];
  const insertedRunIds = new Set();

  for (const event of orderedEvents) {
    if (event && event.event_id && toolResultEventIds.has(event.event_id)) {
      continue;
    }

    reorderedEvents.push(event);

    if (
      event
      && event.actor === 'user'
      && event.run_id
      && toolResultsByRunId.has(event.run_id)
      && !insertedRunIds.has(event.run_id)
    ) {
      reorderedEvents.push(...toolResultsByRunId.get(event.run_id));
      insertedRunIds.add(event.run_id);
    }
  }

  for (const [runId, toolEvents] of toolResultsByRunId.entries()) {
    if (!insertedRunIds.has(runId)) {
      reorderedEvents.push(...toolEvents);
    }
  }

  return reorderedEvents;
}

/**
 * Loads Streamed assistant text by run ID for the surrounding workflow.
 */
async function loadStreamedAssistantTextByRunId(supabase, runIds) {
  const uniqueRunIds = [...new Set((runIds || []).filter(Boolean))];

  if (uniqueRunIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('stream_events')
    .select('run_id, seq_num, payload')
    .in('run_id', uniqueRunIds)
    .eq('event_type', 'assistant.delta')
    .order('seq_num', { ascending: true });

  if (error) {
    throw error;
  }

  const textByRunId = new Map();

  for (const row of data || []) {
    const text = row && row.payload && typeof row.payload.text === 'string'
      ? row.payload.text
      : '';

    if (!text) {
      continue;
    }

    textByRunId.set(row.run_id, `${textByRunId.get(row.run_id) || ''}${text}`);
  }

  return textByRunId;
}

/**
 * Hydrates Missing assistant turns before prompt context is built.
 */
async function hydrateMissingAssistantTurns(supabase, events, options = {}) {
  const orderedEvents = Array.isArray(events) ? events : [];
  const excludedRunId = options.excludeRunId || null;
  const missingAssistantRunIds = orderedEvents
    .filter(event => (
      event
      && event.actor === 'user'
      && event.run_id
      && event.run_id !== excludedRunId
      && !hasAssistantEventForRun(orderedEvents, event.run_id)
    ))
    .map(event => event.run_id);
  const streamedTextByRunId = await loadStreamedAssistantTextByRunId(supabase, missingAssistantRunIds);

  if (streamedTextByRunId.size === 0) {
    return orderedEvents;
  }

  const hydratedEvents = [];

  for (let index = 0; index < orderedEvents.length; index += 1) {
    const event = orderedEvents[index];
    hydratedEvents.push(event);

    if (!event || !event.run_id) {
      continue;
    }

    const streamedText = streamedTextByRunId.get(event.run_id);
    const nextEvent = orderedEvents[index + 1];

    if (
      !streamedText
      || (
        nextEvent
        && nextEvent.run_id === event.run_id
        && nextEvent.actor !== 'assistant'
      )
    ) {
      continue;
    }

    hydratedEvents.push({
      event_id: `streamed-assistant:${event.run_id}`,
      user_id: event.user_id,
      session_key: event.session_key,
      session_id: event.session_id,
      parent_event_id: event.event_id || null,
      seq_num: event.seq_num,
      event_type: 'assistant.streamed_reply',
      actor: 'assistant',
      run_id: event.run_id,
      synthetic: true,
      payload: {
        text: streamedText,
        source: 'stream_events',
        hiddenInFeed: true
      }
    });
  }

  return hydratedEvents;
}

/**
 * Lists Recent transcript events for run for the caller.
 */
async function listRecentTranscriptEventsForRun(run, limit = 12) {
  const supabase = getAdminClientOrThrow();
  const { data: triggerEvent, error: triggerEventError } = await supabase
    .from('session_events')
    .select('seq_num')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .eq('session_id', run.session_id)
    .eq('run_id', run.run_id)
    .eq('actor', 'user')
    .order('seq_num', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (triggerEventError) {
    throw triggerEventError;
  }

  let query = supabase
    .from('session_events')
    .select('*')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .eq('session_id', run.session_id);

  if (triggerEvent && Number.isFinite(triggerEvent.seq_num)) {
    query = query.lte('seq_num', triggerEvent.seq_num);
  }

  const { data, error } = await query
    .order('seq_num', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const orderedEvents = reorderRunAttachedToolResults([...data].reverse());

  return hydrateMissingAssistantTurns(supabase, orderedEvents, {
    excludeRunId: run.run_id
  });
}

/**
 * Lists Transcript events for session for the caller.
 */
async function listTranscriptEventsForSession({ userId, sessionKey, sessionId }) {
  const supabase = getAdminClientOrThrow();
  let from = 0;
  const pageSize = 500;
  const events = [];

  while (true) {
    const { data, error } = await supabase
      .from('session_events')
      .select('*')
      .eq('user_id', userId)
      .eq('session_key', sessionKey)
      .eq('session_id', sessionId)
      .order('seq_num', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    events.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return events;
}

/**
 * Handles To runtime messages for transcript-read.service.js.
 */
function toRuntimeMessages(events) {
  return events
    .map(event => {
      const payload = event.payload || {};
      const content = payload.message || payload.text || '';

      if (event.actor === 'tool' && event.event_type === 'tool.result') {
        const observation = String(payload.observation || '').trim();

        if (!observation) {
          return null;
        }

        const toolName = payload.toolName || 'unknown_tool';
        const resultStatus = payload.resultStatus ? ` (${payload.resultStatus})` : '';

        return {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Tool result - ${toolName}${resultStatus}:\n${observation}`
            }
          ]
        };
      }

      if (!content) {
        return null;
      }

      if (event.actor === 'user') {
        return {
          role: 'user',
          content: [
            {
              type: 'text',
              text: content
            }
          ]
        };
      }

      if (event.actor === 'assistant') {
        return {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: content
            }
          ]
        };
      }

      if (event.event_type === 'compaction.summary' && payload.summary) {
        return {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `System summary:\n${payload.summary}`
            }
          ]
        };
      }

      return null;
    })
    .filter(Boolean);
}

module.exports = {
  listRecentTranscriptEventsForRun,
  listTranscriptEventsForSession,
  toRuntimeMessages
};
