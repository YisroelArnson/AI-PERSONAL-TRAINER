const { getSupabaseAdminClient } = require('../../infra/supabase/client');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function listRecentTranscriptEventsForRun(run, limit = 12) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_events')
    .select('*')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .eq('session_id', run.session_id)
    .order('seq_num', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return [...data].reverse();
}

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

      return null;
    })
    .filter(Boolean);
}

module.exports = {
  listRecentTranscriptEventsForRun,
  toRuntimeMessages
};
