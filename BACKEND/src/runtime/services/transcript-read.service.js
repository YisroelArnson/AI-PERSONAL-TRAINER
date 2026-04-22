/**
 * File overview:
 * Implements runtime service logic for transcript read.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
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

  return [...data].reverse();
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
