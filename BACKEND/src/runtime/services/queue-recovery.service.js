/**
 * File overview:
 * Implements runtime service logic for queue recovery.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - jobExists: Handles Job exists for queue-recovery.service.js.
 * - listDirtySessionIndexRecords: Lists Dirty session index records for the caller.
 * - listDirtyMemoryDocRecords: Lists Dirty memory doc records for the caller.
 * - replayJobFromDeadLetter: Replays Job from dead letter back through the system.
 * - replayDeadLetterById: Replays Dead letter by ID back through the system.
 * - reconcileQueuedRuns: Reconciles Queued runs with the system state.
 * - reconcilePendingDeliveries: Reconciles Pending deliveries with the system state.
 * - reconcileDirtyIndexes: Reconciles Dirty indexes with the system state.
 * - reconcileEligibleCompactions: Reconciles Eligible compactions with the system state.
 * - reconcileQueueState: Reconciles Queue state with the system state.
 * - replayOpenDeadLetters: Replays Open dead letters back through the system.
 */

const {
  enqueueAgentRunTurn,
  enqueueDeliveryRetry,
  enqueueDeliverySend,
  enqueueMemoryDocIndexSync,
  enqueuePreCompactionMemoryFlush,
  enqueueSessionCompaction,
  enqueueSessionIndexSync,
  enqueueSessionMemoryFlush,
  getQueue
} = require('../../infra/queue/agent.queue');
const {
  JOB_NAMES,
  QUEUE_NAMES,
  buildAgentRunTurnJobId,
  buildDeliveryRetryJobId,
  buildDeliverySendJobId,
  buildMemoryDocIndexSyncJobId,
  buildSessionCompactionJobId,
  buildSessionIndexSyncJobId,
  buildSessionMemoryFlushJobId
} = require('../../infra/queue/queue.constants');
const { appendSessionEvent } = require('./transcript-write.service');
const {
  getDeliveryRecordById,
  listPendingDeliveryRecords
} = require('./delivery-outbox.service');
const { getDeadLetterById, listOpenDeadLetters, markDeadLetterReplayed } = require('./dead-letter.service');
const { getMemoryDocRecord, getSessionIndexState } = require('./indexing-state.service');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { getRunById, listRunsByStatus, markRunQueuedForReplay } = require('./run-state.service');
const {
  getSessionCompactionSnapshot,
  isSessionCompactionEligible
} = require('./session-compaction.service');

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
 * Handles Job exists for queue-recovery.service.js.
 */
async function jobExists(queueName, jobId) {
  const job = await getQueue(queueName).getJob(jobId);
  return Boolean(job);
}

/**
 * Lists Dirty session index records for the caller.
 */
async function listDirtySessionIndexRecords(limit = 100) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_index_state')
    .select('*')
    .eq('index_dirty', true)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Lists Dirty memory doc records for the caller.
 */
async function listDirtyMemoryDocRecords(limit = 100) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('index_dirty', true)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Replays Job from dead letter back through the system.
 */
async function replayJobFromDeadLetter(deadLetter) {
  const payload = deadLetter.payload || {};
  let enqueuedJob = null;

  if (deadLetter.job_name === JOB_NAMES.agentRunTurn) {
    const run = await getRunById(deadLetter.run_id || payload.runId);

    await markRunQueuedForReplay(run.run_id);
    await appendSessionEvent({
      userId: run.user_id,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType: 'system.retry',
      actor: 'system',
      runId: run.run_id,
      payload: {
        deadLetterId: deadLetter.dead_letter_id,
        originalJobName: deadLetter.job_name
      },
      idempotencyKey: `system.retry:${run.run_id}:${deadLetter.dead_letter_id}`
    });
    enqueuedJob = await enqueueAgentRunTurn({
      runId: run.run_id,
      userId: run.user_id,
      sessionKey: run.session_key,
      sessionId: run.session_id
    });
  } else if (deadLetter.job_name === JOB_NAMES.memoryIndexSessionDelta) {
    const record = await getSessionIndexState({
      userId: deadLetter.user_id || payload.userId,
      sessionKey: deadLetter.session_key || payload.sessionKey,
      sessionId: deadLetter.session_id || payload.sessionId
    });

    if (!record || record.index_dirty !== true) {
      return null;
    }

    enqueuedJob = await enqueueSessionIndexSync({
      userId: record.user_id,
      sessionKey: record.session_key,
      sessionId: record.session_id,
      mode: 'immediate',
      delayMs: 0
    });
  } else if (deadLetter.job_name === JOB_NAMES.memoryIndexDoc) {
    const record = await getMemoryDocRecord({
      userId: deadLetter.user_id || payload.userId,
      docId: deadLetter.doc_id || payload.docId
    });

    if (!record || record.index_dirty !== true) {
      return null;
    }

    enqueuedJob = await enqueueMemoryDocIndexSync({
      userId: record.user_id,
      docId: record.doc_id,
      delayMs: 0
    });
  } else if (deadLetter.job_name === JOB_NAMES.sessionCompact) {
    const snapshot = await getSessionCompactionSnapshot({
      userId: deadLetter.user_id || payload.userId,
      sessionKey: deadLetter.session_key || payload.sessionKey,
      sessionId: deadLetter.session_id || payload.sessionId
    });

    if (!isSessionCompactionEligible(snapshot)) {
      return null;
    }

    enqueuedJob = await enqueueSessionCompaction({
      userId: snapshot.state.user_id,
      sessionKey: snapshot.state.session_key,
      sessionId: payload.sessionId || deadLetter.session_id,
      nextCompactionCount: snapshot.nextCompactionCount,
      delayMs: 0
    });
  } else if (deadLetter.job_name === JOB_NAMES.memoryFlushPreCompaction) {
    enqueuedJob = await enqueuePreCompactionMemoryFlush({
      userId: deadLetter.user_id || payload.userId,
      sessionKey: deadLetter.session_key || payload.sessionKey,
      sessionId: deadLetter.session_id || payload.sessionId,
      timezone: payload.timezone,
      messageCount: payload.messageCount,
      currentCompactionCount: payload.currentCompactionCount
    });
  } else if (deadLetter.job_name === JOB_NAMES.memoryFlushSessionEnd) {
    enqueuedJob = await enqueueSessionMemoryFlush({
      userId: deadLetter.user_id || payload.userId,
      sessionKey: deadLetter.session_key || payload.sessionKey,
      previousSessionId: payload.previousSessionId || deadLetter.session_id,
      rotationReason: payload.rotationReason,
      timezone: payload.timezone,
      messageCount: payload.messageCount
    });
  } else if (deadLetter.job_name === JOB_NAMES.deliverySend) {
    const delivery = await getDeliveryRecordById(deadLetter.delivery_id || payload.deliveryId);

    if (!delivery || delivery.status === 'delivered') {
      return null;
    }

    enqueuedJob = await enqueueDeliverySend({
      deliveryId: delivery.delivery_id,
      runId: delivery.run_id,
      userId: delivery.user_id
    });
  } else if (deadLetter.job_name === JOB_NAMES.deliveryRetry) {
    const delivery = await getDeliveryRecordById(deadLetter.delivery_id || payload.deliveryId);

    if (!delivery || delivery.status === 'delivered') {
      return null;
    }

    enqueuedJob = await enqueueDeliveryRetry({
      deliveryId: delivery.delivery_id,
      runId: delivery.run_id,
      userId: delivery.user_id,
      attemptCount: Number(delivery.attempt_count || 0) + 1,
      delayMs: 0
    });
  }

  if (deadLetter.dead_letter_id && enqueuedJob && enqueuedJob.jobId) {
    await markDeadLetterReplayed(deadLetter.dead_letter_id, enqueuedJob.jobId);
  }

  return enqueuedJob;
}

/**
 * Replays Dead letter by ID back through the system.
 */
async function replayDeadLetterById(deadLetterId) {
  const deadLetter = await getDeadLetterById(deadLetterId);

  if (!deadLetter) {
    return null;
  }

  return replayJobFromDeadLetter(deadLetter);
}

/**
 * Reconciles Queued runs with the system state.
 */
async function reconcileQueuedRuns(limit = 100) {
  const runs = await listRunsByStatus(['queued'], limit);
  const repaired = [];

  for (const run of runs) {
    const jobId = buildAgentRunTurnJobId(run.run_id);

    if (await jobExists(QUEUE_NAMES.agentRuns, jobId)) {
      continue;
    }

    repaired.push(await enqueueAgentRunTurn({
      runId: run.run_id,
      userId: run.user_id,
      sessionKey: run.session_key,
      sessionId: run.session_id
    }));
  }

  return repaired;
}

/**
 * Reconciles Pending deliveries with the system state.
 */
async function reconcilePendingDeliveries(limit = 100) {
  const deliveries = await listPendingDeliveryRecords(limit);
  const repaired = [];

  for (const delivery of deliveries) {
    const isRetry = Number(delivery.attempt_count || 0) > 0;
    const jobId = isRetry
      ? buildDeliveryRetryJobId({
          deliveryId: delivery.delivery_id,
          attemptCount: Number(delivery.attempt_count || 0) + 1
        })
      : buildDeliverySendJobId({
          deliveryId: delivery.delivery_id
        });
    const queueName = QUEUE_NAMES.delivery;

    if (await jobExists(queueName, jobId)) {
      continue;
    }

    repaired.push(isRetry
      ? await enqueueDeliveryRetry({
          deliveryId: delivery.delivery_id,
          runId: delivery.run_id,
          userId: delivery.user_id,
          attemptCount: Number(delivery.attempt_count || 0) + 1,
          delayMs: 0
        })
      : await enqueueDeliverySend({
          deliveryId: delivery.delivery_id,
          runId: delivery.run_id,
          userId: delivery.user_id
        }));
  }

  return repaired;
}

/**
 * Reconciles Dirty indexes with the system state.
 */
async function reconcileDirtyIndexes(limit = 100) {
  const [sessions, docs] = await Promise.all([
    listDirtySessionIndexRecords(limit),
    listDirtyMemoryDocRecords(limit)
  ]);
  const repaired = [];

  for (const record of sessions) {
    const jobId = buildSessionIndexSyncJobId({
      sessionKey: record.session_key,
      sessionId: record.session_id,
      mode: 'immediate'
    });

    if (await jobExists(QUEUE_NAMES.memoryIndex, jobId)) {
      continue;
    }

    repaired.push(await enqueueSessionIndexSync({
      userId: record.user_id,
      sessionKey: record.session_key,
      sessionId: record.session_id,
      mode: 'immediate',
      delayMs: 0
    }));
  }

  for (const record of docs) {
    const jobId = buildMemoryDocIndexSyncJobId({
      docId: record.doc_id
    });

    if (await jobExists(QUEUE_NAMES.memoryIndex, jobId)) {
      continue;
    }

    repaired.push(await enqueueMemoryDocIndexSync({
      userId: record.user_id,
      docId: record.doc_id,
      delayMs: 0
    }));
  }

  return repaired;
}

/**
 * Reconciles Eligible compactions with the system state.
 */
async function reconcileEligibleCompactions(limit = 100) {
  const sessionRecords = await listDirtySessionIndexRecords(limit);
  const repaired = [];

  for (const record of sessionRecords) {
    const snapshot = await getSessionCompactionSnapshot({
      userId: record.user_id,
      sessionKey: record.session_key,
      sessionId: record.session_id
    });

    if (!isSessionCompactionEligible(snapshot)) {
      continue;
    }

    const jobId = buildSessionCompactionJobId({
      sessionKey: record.session_key,
      sessionId: record.session_id,
      nextCompactionCount: snapshot.nextCompactionCount
    });

    if (await jobExists(QUEUE_NAMES.sessionMaintenance, jobId)) {
      continue;
    }

    repaired.push(await enqueueSessionCompaction({
      userId: record.user_id,
      sessionKey: record.session_key,
      sessionId: record.session_id,
      nextCompactionCount: snapshot.nextCompactionCount,
      delayMs: 0
    }));
  }

  return repaired;
}

/**
 * Reconciles Queue state with the system state.
 */
async function reconcileQueueState(limit = 100) {
  const [runs, deliveries, indexes, compactions] = await Promise.all([
    reconcileQueuedRuns(limit),
    reconcilePendingDeliveries(limit),
    reconcileDirtyIndexes(limit),
    reconcileEligibleCompactions(limit)
  ]);

  return {
    repairedRunJobs: runs.length,
    repairedDeliveryJobs: deliveries.length,
    repairedIndexJobs: indexes.length,
    repairedCompactionJobs: compactions.length
  };
}

/**
 * Replays Open dead letters back through the system.
 */
async function replayOpenDeadLetters(limit = 100) {
  const deadLetters = await listOpenDeadLetters(limit);
  const replayed = [];

  for (const deadLetter of deadLetters) {
    const result = await replayJobFromDeadLetter(deadLetter);

    if (result) {
      replayed.push(result);
    }
  }

  return replayed;
}

module.exports = {
  reconcileQueueState,
  replayDeadLetterById,
  replayOpenDeadLetters
};
