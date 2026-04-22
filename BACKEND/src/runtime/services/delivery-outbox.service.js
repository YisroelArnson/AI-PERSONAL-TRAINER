/**
 * File overview:
 * Implements runtime service logic for delivery outbox.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildRunDeliveryIdempotencyKey: Builds a Run delivery idempotency key used by this file.
 * - loadLatestAssistantTextForRun: Loads Latest assistant text for run for the surrounding workflow.
 * - buildNormalizedRunDeliveryPayload: Builds a Normalized run delivery payload used by this file.
 * - upsertRunDeliveryOutbox: Handles Upsert run delivery outbox for delivery-outbox.service.js.
 * - getLatestDeliveryRecordForRun: Gets Latest delivery record for run needed by this file.
 * - getDeliveryRecordById: Gets Delivery record by ID needed by this file.
 * - updateDeliveryRecord: Updates Delivery record with the latest state.
 * - beginDeliveryAttempt: Handles Begin delivery attempt for delivery-outbox.service.js.
 * - markDeliveryDelivered: Marks Delivery delivered with the appropriate status.
 * - markDeliveryPendingRetry: Marks Delivery pending retry with the appropriate status.
 * - markDeliveryFailed: Marks Delivery failed with the appropriate status.
 * - listPendingDeliveryRecords: Lists Pending delivery records for the caller.
 */

const { getCurrentWorkoutState } = require('./workout-state.service');
const { getStreamEventBounds } = require('./stream-events.service');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const DELIVERY_CHANNEL_IN_APP = 'in_app';

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
 * Builds a Run delivery idempotency key used by this file.
 */
function buildRunDeliveryIdempotencyKey(runId, channel = DELIVERY_CHANNEL_IN_APP) {
  return `delivery:${channel}:${runId}`;
}

/**
 * Loads Latest assistant text for run for the surrounding workflow.
 */
async function loadLatestAssistantTextForRun(runId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_events')
    .select('payload')
    .eq('run_id', runId)
    .eq('actor', 'assistant')
    .order('seq_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.payload) {
    return '';
  }

  return String(data.payload.text || data.payload.message || '').trim();
}

/**
 * Builds a Normalized run delivery payload used by this file.
 */
async function buildNormalizedRunDeliveryPayload({ run, outputText = null, error = null }) {
  const [streamBounds, workout, transcriptOutputText] = await Promise.all([
    getStreamEventBounds(run.run_id).catch(() => ({
      firstSeqNum: null,
      lastSeqNum: null
    })),
    getCurrentWorkoutState({
      userId: run.user_id,
      sessionKey: run.session_key
    }).catch(() => null),
    outputText != null ? Promise.resolve(String(outputText || '')) : loadLatestAssistantTextForRun(run.run_id).catch(() => '')
  ]);
  const effectiveErrorCode = error && error.code ? error.code : run.error_code || null;
  const effectiveErrorMessage = error && error.message
    ? String(error.message).slice(0, 1000)
    : (run.error_message || null);

  return {
    channel: DELIVERY_CHANNEL_IN_APP,
    runId: run.run_id,
    status: run.status,
    sessionKey: run.session_key,
    sessionId: run.session_id,
    triggerType: run.trigger_type,
    provider: run.provider_key || null,
    model: run.model_key || null,
    createdAt: run.created_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    content: {
      text: transcriptOutputText || '',
      errorCode: effectiveErrorCode,
      errorMessage: effectiveErrorMessage
    },
    stream: {
      url: `/v1/runs/${run.run_id}/stream`,
      resultUrl: `/v1/runs/${run.run_id}/result`,
      firstSeqNum: streamBounds.firstSeqNum,
      lastSeqNum: streamBounds.lastSeqNum
    },
    workout: workout || null
  };
}

/**
 * Handles Upsert run delivery outbox for delivery-outbox.service.js.
 */
async function upsertRunDeliveryOutbox({
  run,
  payload,
  status = 'pending',
  channel = DELIVERY_CHANNEL_IN_APP
}) {
  const supabase = getAdminClientOrThrow();
  const upsertPayload = {
    run_id: run.run_id,
    user_id: run.user_id,
    channel,
    status,
    idempotency_key: buildRunDeliveryIdempotencyKey(run.run_id, channel),
    payload: payload || {},
    next_attempt_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('delivery_outbox')
    .upsert(upsertPayload, {
      onConflict: 'idempotency_key'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Gets Latest delivery record for run needed by this file.
 */
async function getLatestDeliveryRecordForRun(runId, channel = DELIVERY_CHANNEL_IN_APP) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('delivery_outbox')
    .select('*')
    .eq('run_id', runId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Gets Delivery record by ID needed by this file.
 */
async function getDeliveryRecordById(deliveryId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('delivery_outbox')
    .select('*')
    .eq('delivery_id', deliveryId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Updates Delivery record with the latest state.
 */
async function updateDeliveryRecord(deliveryId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('delivery_outbox')
    .update(patch)
    .eq('delivery_id', deliveryId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Handles Begin delivery attempt for delivery-outbox.service.js.
 */
async function beginDeliveryAttempt(deliveryId) {
  const current = await getDeliveryRecordById(deliveryId);

  if (!current) {
    return null;
  }

  return updateDeliveryRecord(deliveryId, {
    status: 'processing',
    attempt_count: Number(current.attempt_count || 0) + 1
  });
}

/**
 * Marks Delivery delivered with the appropriate status.
 */
async function markDeliveryDelivered(deliveryId) {
  return updateDeliveryRecord(deliveryId, {
    status: 'delivered',
    delivered_at: new Date().toISOString()
  });
}

/**
 * Marks Delivery pending retry with the appropriate status.
 */
async function markDeliveryPendingRetry(deliveryId, nextAttemptAt) {
  return updateDeliveryRecord(deliveryId, {
    status: 'pending',
    next_attempt_at: nextAttemptAt
  });
}

/**
 * Marks Delivery failed with the appropriate status.
 */
async function markDeliveryFailed(deliveryId) {
  return updateDeliveryRecord(deliveryId, {
    status: 'failed'
  });
}

/**
 * Lists Pending delivery records for the caller.
 */
async function listPendingDeliveryRecords(limit = 100) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('delivery_outbox')
    .select('*')
    .in('status', ['pending', 'processing'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = {
  DELIVERY_CHANNEL_IN_APP,
  beginDeliveryAttempt,
  buildNormalizedRunDeliveryPayload,
  buildRunDeliveryIdempotencyKey,
  getDeliveryRecordById,
  getLatestDeliveryRecordForRun,
  listPendingDeliveryRecords,
  markDeliveryDelivered,
  markDeliveryFailed,
  markDeliveryPendingRetry,
  updateDeliveryRecord,
  upsertRunDeliveryOutbox
};
