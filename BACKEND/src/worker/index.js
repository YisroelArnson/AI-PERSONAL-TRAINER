const { Worker } = require('bullmq');

const { env } = require('../config/env');
const { getRedisConnection } = require('../infra/redis/connection');
const { JOB_NAMES, QUEUE_NAMES } = require('../infra/queue/queue.constants');
const { handleAgentRunTurn } = require('./handlers/agent-run-turn.handler');
const { handleIndexSyncMemoryDoc } = require('./handlers/index-sync-memory-doc.handler');
const { handleIndexSyncSession } = require('./handlers/index-sync-session.handler');
const { handleMemoryFlushSessionEnd } = require('./handlers/memory-flush-session-end.handler');

function buildProcessor() {
  return async (job, token) => {
    if (job.name === JOB_NAMES.agentRunTurn) {
      return handleAgentRunTurn(job, token);
    }

    if (job.name === JOB_NAMES.memoryFlushSessionEnd) {
      return handleMemoryFlushSessionEnd(job);
    }

    if (job.name === JOB_NAMES.indexSyncSession) {
      return handleIndexSyncSession(job);
    }

    if (job.name === JOB_NAMES.indexSyncMemoryDoc) {
      return handleIndexSyncMemoryDoc(job);
    }

    throw new Error(`Unsupported job name: ${job.name}`);
  };
}

function startWorker() {
  const connection = getRedisConnection();

  if (!connection) {
    throw new Error('REDIS_URL is not configured');
  }

  const worker = new Worker(QUEUE_NAMES.agent, buildProcessor(), {
    connection,
    concurrency: env.workerConcurrency
  });

  worker.on('ready', () => {
    console.log(`Worker ready for queue ${QUEUE_NAMES.agent}`);
  });

  worker.on('completed', job => {
    console.log(`Completed job ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    if (error && error.code === 'SESSION_MUTATION_LOCK_BUSY') {
      console.warn(`Deferred job ${job ? job.id : 'unknown'} while waiting for session lock`);
      return;
    }

    console.error(`Failed job ${job ? job.id : 'unknown'}:`, error);
  });

  return worker;
}

if (require.main === module) {
  startWorker();
}

module.exports = {
  startWorker
};
