/**
 * File overview:
 * Implements runtime service logic for transcript write.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - mapRpcError: Maps RPC error into the structure expected downstream.
 * - appendSessionEvent: Appends Session event to the existing record.
 * - appendAssistantEvent: Appends Assistant event to the existing record.
 * - appendAssistantEventFallback: Appends Assistant event fallback to the existing record.
 */

const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { badRequest } = require('../../shared/errors');
const { enqueueSessionIndexSyncIfNeeded } = require('./indexing-queue.service');
const { enqueueSessionCompactionIfNeeded } = require('./session-compaction.service');

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
 * Maps RPC error into the structure expected downstream.
 */
function mapRpcError(error) {
  const message = error && error.message ? error.message : 'append_session_event failed';

  if (
    message.includes('MISSING_USER_ID') ||
    message.includes('MISSING_SESSION_KEY') ||
    message.includes('MISSING_SESSION_ID') ||
    message.includes('MISSING_RUN_ID') ||
    message.includes('MISSING_EVENT_TYPE') ||
    message.includes('MISSING_ACTOR')
  ) {
    return badRequest('append_session_event parameters were incomplete');
  }

  return error;
}

function buildSkippedAssistantAppendResult({ run, reason, triggerSeqNum = null, latestUserSeqNum = null, mode = 'guarded' }) {
  return {
    skipped: true,
    reason,
    sessionKey: run.session_key,
    sessionId: run.session_id,
    sessionVersion: null,
    seqNum: null,
    triggerSeqNum,
    latestUserSeqNum,
    mode
  };
}

function normalizeSeqNum(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

async function enqueuePostAppendMaintenance({ userId, sessionKey, sessionId, sourceLabel }) {
  try {
    await enqueueSessionIndexSyncIfNeeded({
      userId,
      sessionKey,
      sessionId
    });
  } catch (queueError) {
    console.warn(`Unable to enqueue session indexing job after ${sourceLabel}:`, queueError.message);
  }

  try {
    await enqueueSessionCompactionIfNeeded({
      userId,
      sessionKey,
      sessionId
    });
  } catch (queueError) {
    console.warn(`Unable to enqueue session compaction job after ${sourceLabel}:`, queueError.message);
  }
}

async function loadAssistantReplyGuardState({ supabase, run }) {
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

  const triggerSeqNum = normalizeSeqNum(triggerEvent && triggerEvent.seq_num);

  if (triggerSeqNum === null) {
    return {
      triggerSeqNum: null,
      latestUserSeqNum: null,
      hasNewerUserEvent: false
    };
  }

  const { data: newerUserEvent, error: newerUserEventError } = await supabase
    .from('session_events')
    .select('seq_num')
    .eq('user_id', run.user_id)
    .eq('session_key', run.session_key)
    .eq('session_id', run.session_id)
    .eq('actor', 'user')
    .gt('seq_num', triggerSeqNum)
    .order('seq_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newerUserEventError) {
    throw newerUserEventError;
  }

  const latestUserSeqNum = normalizeSeqNum(newerUserEvent && newerUserEvent.seq_num);

  return {
    triggerSeqNum,
    latestUserSeqNum,
    hasNewerUserEvent: latestUserSeqNum !== null
  };
}

async function appendAssistantEventIfLatestTurn({
  supabase,
  run,
  eventType,
  payload
}) {
  const { data, error } = await supabase.rpc('append_assistant_event_if_latest_turn', {
    p_user_id: run.user_id,
    p_session_key: run.session_key,
    p_session_id: run.session_id,
    p_run_id: run.run_id,
    p_event_type: eventType,
    p_payload: payload || {},
    p_occurred_at: new Date().toISOString()
  });

  if (error) {
    throw mapRpcError(error);
  }

  return data;
}

/**
 * Appends Session event to the existing record.
 */
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

  await enqueuePostAppendMaintenance({
    userId,
    sessionKey,
    sessionId,
    sourceLabel: 'append_session_event'
  });

  return data;
}

/**
 * Appends Assistant event to the existing record.
 */
async function appendAssistantEvent({
  run,
  eventType,
  text,
  provider,
  model,
  usage,
  stopReason,
  extraPayload = {},
  requireLatestUserTurn = false
}) {
  if (!eventType) {
    throw badRequest('appendAssistantEvent requires an explicit eventType');
  }

  const payload = {
    text,
    provider,
    model,
    usage: usage || {},
    stopReason: stopReason || null,
    ...extraPayload
  };

  if (!requireLatestUserTurn) {
    return appendSessionEvent({
      userId: run.user_id,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType,
      actor: 'assistant',
      runId: run.run_id,
      payload
    });
  }

  try {
    const supabase = getAdminClientOrThrow();
    const result = await appendAssistantEventIfLatestTurn({
      supabase,
      run,
      eventType,
      payload
    });

    if (!result || !result.skipped) {
      await enqueuePostAppendMaintenance({
        userId: run.user_id,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        sourceLabel: 'append_assistant_event_if_latest_turn'
      });
    }

    return result;
  } catch (error) {
    console.warn(`Assistant transcript RPC failed for ${eventType}, falling back to app-side transcript append:`, error.message);
    const supabase = getAdminClientOrThrow();
    return appendAssistantEventFallback({
      supabase,
      run,
      payload,
      eventType,
      requireLatestUserTurn
    });
  }
}

/**
 * Appends Assistant event fallback to the existing record.
 */
async function appendAssistantEventFallback({
  supabase,
  run,
  payload,
  eventType,
  requireLatestUserTurn = false
}) {
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
    if (requireLatestUserTurn) {
      return buildSkippedAssistantAppendResult({
        run,
        reason: 'session_rotated',
        mode: 'guarded_fallback'
      });
    }

    throw badRequest('Session rotated before assistant output could be appended');
  }

  if (requireLatestUserTurn) {
    const guardState = await loadAssistantReplyGuardState({
      supabase,
      run
    });

    if (guardState.hasNewerUserEvent) {
      return buildSkippedAssistantAppendResult({
        run,
        reason: 'stale_user_turn',
        triggerSeqNum: guardState.triggerSeqNum,
        latestUserSeqNum: guardState.latestUserSeqNum,
        mode: 'guarded_fallback'
      });
    }
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
      event_type: eventType,
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

  await enqueuePostAppendMaintenance({
    userId: run.user_id,
    sessionKey: run.session_key,
    sessionId: run.session_id,
    sourceLabel: 'fallback transcript append'
  });

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
  appendAssistantEvent,
  appendSessionEvent
};
