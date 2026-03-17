const { getSupabaseAdminClient } = require('../../infra/supabase/client');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function appendStreamEvent({ runId, eventType, payload }) {
  const supabase = getAdminClientOrThrow();

  const { data: latestEvent, error: latestError } = await supabase
    .from('stream_events')
    .select('seq_num')
    .eq('run_id', runId)
    .order('seq_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const nextSeqNum = latestEvent ? latestEvent.seq_num + 1 : 1;

  const { data, error } = await supabase
    .from('stream_events')
    .insert({
      run_id: runId,
      seq_num: nextSeqNum,
      event_type: eventType,
      payload
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  appendStreamEvent
};
