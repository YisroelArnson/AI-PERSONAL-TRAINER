/**
 * File overview:
 * Provides infrastructure helpers for agent queue.
 *
 * Main functions in this file:
 * - getQueue: Gets Queue needed by this file.
 * - getQueueByJobName: Gets Queue by job name needed by this file.
 * - getAgentQueue: Gets Agent queue needed by this file.
 * - enqueueJob: Enqueues Job for asynchronous work.
 * - enqueueAgentRunTurn: Enqueues Agent run turn for asynchronous work.
 * - enqueueSessionMemoryFlush: Enqueues Session memory flush for asynchronous work.
 * - enqueuePreCompactionMemoryFlush: Enqueues Pre compaction memory flush for asynchronous work.
 * - enqueueSessionIndexSync: Enqueues Session index sync for asynchronous work.
 * - enqueueMemoryDocIndexSync: Enqueues Memory doc index sync for asynchronous work.
 * - enqueueSessionCompaction: Enqueues Session compaction for asynchronous work.
 * - enqueueDeliverySend: Enqueues Delivery send for asynchronous work.
 * - enqueueDeliveryRetry: Enqueues Delivery retry for asynchronous work.
 */

const { Queue } = require('bullmq');

const { createSharedJobOptions } = require('./queue.config');
const { getRedisConnection } = require('../redis/connection');
const {
  JOB_NAMES,
  QUEUE_NAMES,
  buildAgentRunTurnJobId,
  buildDeliveryRetryJobId,
  buildDeliverySendJobId,
  buildJobEnvelope,
  buildMemoryDocIndexSyncJobId,
  buildSessionCompactionJobId,
  buildSessionIndexSyncJobId,
  buildSessionMemoryFlushJobId,
  resolveQueueNameForJobName
} = require('./queue.constants');

const queuesByName = new Map();

/**
 * Gets Queue needed by this file.
 */
function getQueue(queueName) {
  const connection = getRedisConnection();

  if (!connection) {
    throw new Error('REDIS_URL is not configured');
  }

  if (!queuesByName.has(queueName)) {
    queuesByName.set(queueName, new Queue(queueName, {
      connection,
      defaultJobOptions: createSharedJobOptions()
    }));
  }

  return queuesByName.get(queueName);
}

/**
 * Gets Queue by job name needed by this file.
 */
function getQueueByJobName(jobName) {
  return getQueue(resolveQueueNameForJobName(jobName));
}

/**
 * Gets Agent queue needed by this file.
 */
function getAgentQueue() {
  return getQueue(QUEUE_NAMES.agentRuns);
}

/**
 * Enqueues Job for asynchronous work.
 */
async function enqueueJob(jobName, payload, options = {}) {
  const queueName = resolveQueueNameForJobName(jobName);
  const queue = getQueueByJobName(jobName);
  const job = await queue.add(jobName, buildJobEnvelope(payload), options);

  return {
    jobId: job.id,
    queueName,
    jobName,
    payload: job.data,
    mode: 'bullmq'
  };
}

/**
 * Enqueues Agent run turn for asynchronous work.
 */
async function enqueueAgentRunTurn({ runId, userId, sessionKey, sessionId }) {
  return enqueueJob(
    JOB_NAMES.agentRunTurn,
    {
      runId,
      userId,
      sessionKey,
      sessionId
    },
    {
      jobId: buildAgentRunTurnJobId(runId)
    }
  );
}

/**
 * Enqueues Session memory flush for asynchronous work.
 */
async function enqueueSessionMemoryFlush({
  userId,
  sessionKey,
  previousSessionId,
  rotationReason,
  timezone,
  messageCount
}) {
  return enqueueJob(
    JOB_NAMES.memoryFlushSessionEnd,
    {
      flushKind: 'session_end',
      userId,
      sessionKey,
      previousSessionId,
      rotationReason,
      timezone,
      messageCount
    },
    {
      jobId: buildSessionMemoryFlushJobId({
        sessionKey,
        previousSessionId,
        flushKind: 'session_end'
      }),
      priority: 2
    }
  );
}

/**
 * Enqueues Pre compaction memory flush for asynchronous work.
 */
async function enqueuePreCompactionMemoryFlush({
  userId,
  sessionKey,
  sessionId,
  timezone,
  messageCount,
  currentCompactionCount
}) {
  return enqueueJob(
    JOB_NAMES.memoryFlushPreCompaction,
    {
      flushKind: 'pre_compaction',
      userId,
      sessionKey,
      sessionId,
      timezone,
      messageCount,
      currentCompactionCount
    },
    {
      jobId: buildSessionMemoryFlushJobId({
        sessionKey,
        sessionId,
        flushKind: 'pre_compaction',
        compactionCount: currentCompactionCount
      }),
      priority: 1
    }
  );
}

/**
 * Enqueues Session index sync for asynchronous work.
 */
async function enqueueSessionIndexSync({
  userId,
  sessionKey,
  sessionId,
  mode = 'default',
  delayMs = 0
}) {
  return enqueueJob(
    JOB_NAMES.memoryIndexSessionDelta,
    {
      userId,
      sessionKey,
      sessionId,
      mode
    },
    {
      jobId: buildSessionIndexSyncJobId({
        sessionKey,
        sessionId,
        mode
      }),
      priority: mode === 'immediate' ? 2 : 5,
      delay: Math.max(0, delayMs || 0)
    }
  );
}

/**
 * Enqueues Memory doc index sync for asynchronous work.
 */
async function enqueueMemoryDocIndexSync({
  userId,
  docId,
  delayMs = 0
}) {
  return enqueueJob(
    JOB_NAMES.memoryIndexDoc,
    {
      userId,
      docId
    },
    {
      jobId: buildMemoryDocIndexSyncJobId({
        docId
      }),
      priority: 4,
      delay: Math.max(0, delayMs || 0)
    }
  );
}

/**
 * Enqueues Session compaction for asynchronous work.
 */
async function enqueueSessionCompaction({
  userId,
  sessionKey,
  sessionId,
  nextCompactionCount,
  delayMs = 0
}) {
  return enqueueJob(
    JOB_NAMES.sessionCompact,
    {
      userId,
      sessionKey,
      sessionId,
      nextCompactionCount
    },
    {
      jobId: buildSessionCompactionJobId({
        sessionKey,
        sessionId,
        nextCompactionCount
      }),
      priority: 3,
      delay: Math.max(0, delayMs || 0)
    }
  );
}

/**
 * Enqueues Delivery send for asynchronous work.
 */
async function enqueueDeliverySend({
  deliveryId,
  runId,
  userId
}) {
  return enqueueJob(
    JOB_NAMES.deliverySend,
    {
      deliveryId,
      runId,
      userId
    },
    {
      jobId: buildDeliverySendJobId({
        deliveryId
      }),
      priority: 1
    }
  );
}

/**
 * Enqueues Delivery retry for asynchronous work.
 */
async function enqueueDeliveryRetry({
  deliveryId,
  runId,
  userId,
  attemptCount,
  delayMs = 0
}) {
  return enqueueJob(
    JOB_NAMES.deliveryRetry,
    {
      deliveryId,
      runId,
      userId,
      attemptCount
    },
    {
      jobId: buildDeliveryRetryJobId({
        deliveryId,
        attemptCount
      }),
      priority: 1,
      delay: Math.max(0, delayMs || 0)
    }
  );
}

module.exports = {
  enqueueAgentRunTurn,
  enqueueDeliveryRetry,
  enqueueDeliverySend,
  enqueueMemoryDocIndexSync,
  enqueuePreCompactionMemoryFlush,
  enqueueSessionCompaction,
  enqueueSessionIndexSync,
  enqueueSessionMemoryFlush,
  getAgentQueue,
  getQueue,
  getQueueByJobName
};
