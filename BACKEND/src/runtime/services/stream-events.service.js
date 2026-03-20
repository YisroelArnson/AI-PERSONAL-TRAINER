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

async function listStreamEvents({ runId, afterSeqNum = 0, limit = 200 }) {
  const supabase = getAdminClientOrThrow();
  let query = supabase
    .from('stream_events')
    .select('*')
    .eq('run_id', runId)
    .order('seq_num', { ascending: true })
    .limit(limit);

  if (afterSeqNum > 0) {
    query = query.gt('seq_num', afterSeqNum);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function getStreamEventBounds(runId) {
  const supabase = getAdminClientOrThrow();
  const [firstResult, lastResult] = await Promise.all([
    supabase
      .from('stream_events')
      .select('seq_num')
      .eq('run_id', runId)
      .order('seq_num', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stream_events')
      .select('seq_num')
      .eq('run_id', runId)
      .order('seq_num', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (firstResult.error) {
    throw firstResult.error;
  }

  if (lastResult.error) {
    throw lastResult.error;
  }

  return {
    firstSeqNum: firstResult.data ? firstResult.data.seq_num : null,
    lastSeqNum: lastResult.data ? lastResult.data.seq_num : null
  };
}

module.exports = {
  appendStreamEvent,
  listStreamEvents,
  getStreamEventBounds
};
