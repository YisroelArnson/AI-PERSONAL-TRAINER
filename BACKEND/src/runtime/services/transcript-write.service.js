const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { badRequest } = require('../../shared/errors');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function mapRpcError(error) {
  const message = error && error.message ? error.message : 'append_session_event failed';

  if (
    message.includes('MISSING_USER_ID') ||
    message.includes('MISSING_SESSION_KEY') ||
    message.includes('MISSING_SESSION_ID') ||
    message.includes('MISSING_EVENT_TYPE') ||
    message.includes('MISSING_ACTOR')
  ) {
    return badRequest('append_session_event parameters were incomplete');
  }

  return error;
}

async function appendSessionEvent({
  userId,
  sessionKey,
  sessionId,
  eventType,
  actor,
  runId,
  payload,
  occurredAt,
  idempotencyKey
}) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase.rpc('append_session_event', {
    p_user_id: userId,
    p_session_key: sessionKey,
    p_session_id: sessionId,
    p_event_type: eventType,
    p_actor: actor,
    p_run_id: runId || null,
    p_payload: payload || {},
    p_occurred_at: occurredAt || new Date().toISOString(),
    p_idempotency_key: idempotencyKey || null
  });

  if (error) {
    throw mapRpcError(error);
  }

  return data;
}

async function appendAssistantMessageEvent({ run, text, provider, model, usage, stopReason }) {
  const payload = {
    text,
    provider,
    model,
    usage: usage || {},
    stopReason: stopReason || null
  };
  try {
    return await appendSessionEvent({
      userId: run.user_id,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType: 'assistant.message',
      actor: 'assistant',
      runId: run.run_id,
      payload
    });
  } catch (error) {
    console.warn('append_session_event RPC failed, falling back to app-side transcript append:', error.message);
    const supabase = getAdminClientOrThrow();
    return appendAssistantMessageEventFallback({
      supabase,
      run,
      payload
    });
  }
}

async function appendAssistantMessageEventFallback({ supabase, run, payload }) {
  const { data: state, error: stateError } = await supabase
    .from('session_state')
    .select('*')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .single();

  if (stateError) {
    throw stateError;
  }

  if (state.current_session_id !== run.session_id) {
    throw badRequest('Session rotated before assistant output could be appended');
  }

  const { data: latestEvent, error: latestError } = await supabase
    .from('session_events')
    .select('seq_num')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .eq('session_id', run.session_id)
    .order('seq_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const nextSeqNum = latestEvent ? latestEvent.seq_num + 1 : 1;

  const { data: event, error: eventError } = await supabase
    .from('session_events')
    .insert({
      user_id: run.user_id,
      session_key: run.session_key,
      session_id: run.session_id,
      parent_event_id: state.leaf_event_id,
      seq_num: nextSeqNum,
      event_type: 'assistant.message',
      actor: 'assistant',
      run_id: run.run_id,
      payload
    })
    .select('*')
    .single();

  if (eventError) {
    throw eventError;
  }

  const { data: updatedState, error: updateError } = await supabase
    .from('session_state')
    .update({
      leaf_event_id: event.event_id,
      session_version: state.session_version + 1
    })
    .eq('id', state.id)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  return {
    eventId: event.event_id,
    sessionKey: updatedState.session_key,
    sessionId: updatedState.current_session_id,
    sessionVersion: updatedState.session_version,
    seqNum: nextSeqNum,
    mode: 'fallback'
  };
}

module.exports = {
  appendAssistantMessageEvent,
  appendSessionEvent
};
