const { Queue } = require('bullmq');

const { getRedisConnection } = require('../redis/connection');
const {
  JOB_NAMES,
  QUEUE_NAMES,
  buildAgentRunTurnJobId,
  buildSessionMemoryFlushJobId,
  buildSessionIndexSyncJobId,
  buildMemoryDocIndexSyncJobId
} = require('./queue.constants');

let agentQueue;

function getAgentQueue() {
  const connection = getRedisConnection();

  if (!connection) {
    throw new Error('REDIS_URL is not configured');
  }

  if (!agentQueue) {
    agentQueue = new Queue(QUEUE_NAMES.agent, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 1000
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 5000
        }
      }
    });
  }

  return agentQueue;
}

async function enqueueAgentRunTurn({ runId, userId, sessionKey, sessionId }) {
  const queue = getAgentQueue();
  const jobId = buildAgentRunTurnJobId(runId);
  const job = await queue.add(
    JOB_NAMES.agentRunTurn,
    {
      runId,
      userId,
      sessionKey,
      sessionId
    },
    {
      jobId
    }
  );

  return {
    jobId: job.id,
    queueName: QUEUE_NAMES.agent,
    jobName: JOB_NAMES.agentRunTurn,
    payload: job.data,
    mode: 'bullmq'
  };
}

async function enqueueSessionMemoryFlush({
  userId,
  sessionKey,
  previousSessionId,
  rotationReason,
  timezone,
  messageCount
}) {
  const queue = getAgentQueue();
  const jobId = buildSessionMemoryFlushJobId({
    sessionKey,
    previousSessionId
  });
  const job = await queue.add(
    JOB_NAMES.memoryFlushSessionEnd,
    {
      userId,
      sessionKey,
      previousSessionId,
      rotationReason,
      timezone,
      messageCount
    },
    {
      jobId,
      priority: 1
    }
  );

  return {
    jobId: job.id,
    queueName: QUEUE_NAMES.agent,
    jobName: JOB_NAMES.memoryFlushSessionEnd,
    payload: job.data,
    mode: 'bullmq'
  };
}

async function enqueueSessionIndexSync({
  userId,
  sessionKey,
  sessionId,
  mode = 'default',
  delayMs = 0
}) {
  const queue = getAgentQueue();
  const jobId = buildSessionIndexSyncJobId({
    sessionKey,
    sessionId,
    mode
  });
  const job = await queue.add(
    JOB_NAMES.indexSyncSession,
    {
      userId,
      sessionKey,
      sessionId
    },
    {
      jobId,
      priority: mode === 'immediate' ? 2 : 5,
      delay: Math.max(0, delayMs || 0)
    }
  );

  return {
    jobId: job.id,
    queueName: QUEUE_NAMES.agent,
    jobName: JOB_NAMES.indexSyncSession,
    payload: job.data,
    mode: 'bullmq'
  };
}

async function enqueueMemoryDocIndexSync({
  userId,
  docId,
  delayMs = 0
}) {
  const queue = getAgentQueue();
  const jobId = buildMemoryDocIndexSyncJobId({
    docId
  });
  const job = await queue.add(
    JOB_NAMES.indexSyncMemoryDoc,
    {
      userId,
      docId
    },
    {
      jobId,
      priority: 4,
      delay: Math.max(0, delayMs || 0)
    }
  );

  return {
    jobId: job.id,
    queueName: QUEUE_NAMES.agent,
    jobName: JOB_NAMES.indexSyncMemoryDoc,
    payload: job.data,
    mode: 'bullmq'
  };
}

module.exports = {
  getAgentQueue,
  enqueueAgentRunTurn,
  enqueueSessionMemoryFlush,
  enqueueSessionIndexSync,
  enqueueMemoryDocIndexSync
};
