/**
 * File overview:
 * Implements runtime service logic for dead letter.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildCanonicalIdentifiers: Builds a Canonical identifiers used by this file.
 * - inferReplayable: Infers Replayable from the available inputs.
 * - recordDeadLetterFromJob: Records Dead letter from job for later use.
 * - listOpenDeadLetters: Lists Open dead letters for the caller.
 * - getDeadLetterById: Gets Dead letter by ID needed by this file.
 * - updateDeadLetter: Updates Dead letter with the latest state.
 * - markDeadLetterReplayed: Marks Dead letter replayed with the appropriate status.
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
 * Builds a Canonical identifiers used by this file.
 */
function buildCanonicalIdentifiers(job) {
  const data = job && job.data && typeof job.data === 'object' ? job.data : {};

  return {
    userId: data.userId || null,
    runId: data.runId || null,
    sessionKey: data.sessionKey || null,
    sessionId: data.sessionId || data.previousSessionId || null,
    docId: data.docId || null,
    deliveryId: data.deliveryId || null
  };
}

/**
 * Infers Replayable from the available inputs.
 */
function inferReplayable(jobName) {
  return [
    'agent.run_turn',
    'memory.index_session_delta',
    'memory.index_doc',
    'session.compact',
    'memory.flush_pre_compaction',
    'memory.flush_session_end',
    'delivery.send',
    'delivery.retry'
  ].includes(jobName);
}

/**
 * Records Dead letter from job for later use.
 */
async function recordDeadLetterFromJob({
  queueName,
  job,
  errorClass = 'transient',
  errorCode = null,
  errorMessage = null,
  errorStack = null
}) {
  if (!job) {
    return null;
  }

  const supabase = getAdminClientOrThrow();
  const identifiers = buildCanonicalIdentifiers(job);
  const upsertPayload = {
    queue_name: queueName,
    job_name: job.name,
    bullmq_job_id: String(job.id),
    user_id: identifiers.userId,
    run_id: identifiers.runId,
    session_key: identifiers.sessionKey,
    session_id: identifiers.sessionId,
    doc_id: identifiers.docId,
    delivery_id: identifiers.deliveryId,
    payload: job.data || {},
    error_class: errorClass || 'transient',
    error_code: errorCode,
    error_message: errorMessage || job.failedReason || null,
    error_stack: errorStack || (
      Array.isArray(job.stacktrace) && job.stacktrace.length > 0
        ? job.stacktrace.join('\n')
        : null
    ),
    attempt_count: Number(job.attemptsMade || 0),
    max_attempts: Number(job.opts && job.opts.attempts ? job.opts.attempts : 1),
    replayable: inferReplayable(job.name),
    last_failed_at: new Date().toISOString(),
    resolution_status: 'open'
  };
  const { data, error } = await supabase
    .from('queue_dead_letters')
    .upsert(upsertPayload, {
      onConflict: 'queue_name,bullmq_job_id'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Lists Open dead letters for the caller.
 */
async function listOpenDeadLetters(limit = 100) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('queue_dead_letters')
    .select('*')
    .eq('resolution_status', 'open')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Gets Dead letter by ID needed by this file.
 */
async function getDeadLetterById(deadLetterId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('queue_dead_letters')
    .select('*')
    .eq('dead_letter_id', deadLetterId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Updates Dead letter with the latest state.
 */
async function updateDeadLetter(deadLetterId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('queue_dead_letters')
    .update(patch)
    .eq('dead_letter_id', deadLetterId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Marks Dead letter replayed with the appropriate status.
 */
async function markDeadLetterReplayed(deadLetterId, replayJobId) {
  const current = await getDeadLetterById(deadLetterId);

  if (!current) {
    return null;
  }

  return updateDeadLetter(deadLetterId, {
    resolution_status: 'replayed',
    replay_count: Number(current.replay_count || 0) + 1,
    last_replayed_at: new Date().toISOString(),
    last_replayed_job_id: replayJobId || null
  });
}

module.exports = {
  getDeadLetterById,
  listOpenDeadLetters,
  markDeadLetterReplayed,
  recordDeadLetterFromJob,
  updateDeadLetter
};
