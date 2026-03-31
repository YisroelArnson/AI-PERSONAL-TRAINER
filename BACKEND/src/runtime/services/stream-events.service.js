const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const {
  listAllHotRunStreamEvents,
  markHotRunStreamFlushed,
  mirrorStreamEvent,
  publishHotStreamEvent
} = require('./run-stream-redis.service');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function appendStreamEvent({ runId, eventType, payload }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase.rpc('append_stream_event', {
    p_run_id: runId,
    p_event_type: eventType,
    p_payload: payload || {}
  });

  if (error) {
    throw error;
  }

  const row = data
    ? {
        id: data.id,
        run_id: data.run_id || runId,
        seq_num: data.seq_num,
        event_type: data.event_type || eventType,
        payload: data.payload || payload || {},
        created_at: data.created_at || new Date().toISOString()
      }
    : null;

  if (!row) {
    throw new Error('append_stream_event returned no row');
  }

  try {
    await mirrorStreamEvent(row);
  } catch (redisError) {
    console.warn('Run stream Redis mirror failed:', redisError.message);
  }

  return row;
}

async function flushBufferedRunStreamEvents(runId) {
  const supabase = getAdminClientOrThrow();
  const hotResult = await listAllHotRunStreamEvents(runId);

  if (!hotResult.available) {
    return {
      flushed: false,
      reason: hotResult.reason || 'redis_unavailable',
      eventCount: 0,
      lastSeqNum: null
    };
  }

  const rows = Array.isArray(hotResult.rows) ? hotResult.rows : [];

  if (rows.length === 0) {
    return {
      flushed: true,
      eventCount: 0,
      lastSeqNum: null
    };
  }

  const events = rows.map(row => ({
    seq_num: row.seq_num,
    event_type: row.event_type,
    payload: row.payload || {},
    created_at: row.created_at || null
  }));

  const { data, error } = await supabase.rpc('append_stream_events_bulk', {
    p_run_id: runId,
    p_events: events
  });

  if (error) {
    throw error;
  }

  const lastSeqNum = rows[rows.length - 1].seq_num;

  try {
    await markHotRunStreamFlushed({
      runId,
      lastSeqNum
    });
  } catch (redisError) {
    console.warn('Unable to mark hot run stream as flushed:', redisError.message);
  }

  return {
    flushed: true,
    eventCount: rows.length,
    insertedCount: data && Number.isFinite(Number(data.insertedCount))
      ? Number(data.insertedCount)
      : null,
    lastSeqNum
  };
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
  flushBufferedRunStreamEvents,
  listStreamEvents,
  getStreamEventBounds,
  publishHotStreamEvent
};
