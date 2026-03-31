const { Worker } = require('bullmq');

const { env } = require('../config/env');
const { getRedisConnection } = require('../infra/redis/connection');
const { JOB_NAMES, QUEUE_NAMES } = require('../infra/queue/queue.constants');
const { handleAgentRunTurn } = require('./handlers/agent-run-turn.handler');
const { handleIndexSyncMemoryDoc } = require('./handlers/index-sync-memory-doc.handler');
const { handleIndexSyncSession } = require('./handlers/index-sync-session.handler');
const { handleMemoryFlushSessionEnd } = require('./handlers/memory-flush-session-end.handler');

function shortenValue(value, maxLength = 48) {
  const stringValue = String(value || '');

  if (!stringValue) {
    return '-';
  }

  if (stringValue.length <= maxLength) {
    return stringValue;
  }

  return `${stringValue.slice(0, maxLength - 1)}…`;
}

function shortenUuid(value) {
  const stringValue = String(value || '');

  if (stringValue.length >= 8) {
    return `${stringValue.slice(0, 8)}…`;
  }

  return stringValue || '-';
}

function formatJobLabel(job) {
  if (!job) {
    return 'JOB';
  }

  if (job.name === JOB_NAMES.agentRunTurn) {
    const runId = String(job.data && job.data.runId || '').trim();
    return `RUN ${shortenUuid(runId || job.id)}`;
  }

  if (job.name === JOB_NAMES.memoryFlushSessionEnd) {
    return 'MEMORY FLUSH';
  }

  if (job.name === JOB_NAMES.indexSyncSession) {
    return 'SESSION INDEX';
  }

  if (job.name === JOB_NAMES.indexSyncMemoryDoc) {
    return 'MEMORY INDEX';
  }

  return shortenValue(job.name || 'JOB');
}

function formatJobDetails(job) {
  if (!job) {
    return '';
  }

  if (job.name === JOB_NAMES.agentRunTurn) {
    return `run=${shortenUuid(job.data && job.data.runId)}`;
  }

  if (job.name === JOB_NAMES.memoryFlushSessionEnd) {
    return `session=${shortenValue(job.data && job.data.sessionKey)} | previous=${shortenUuid(job.data && job.data.previousSessionId)}`;
  }

  if (job.name === JOB_NAMES.indexSyncSession) {
    const idParts = String(job.id || '').split('__');
    const mode = idParts.length >= 4 ? idParts[3] : 'default';
    return `session=${shortenValue(job.data && job.data.sessionKey)} | sessionId=${shortenUuid(job.data && job.data.sessionId)} | mode=${mode}`;
  }

  if (job.name === JOB_NAMES.indexSyncMemoryDoc) {
    return `doc=${shortenUuid(job.data && job.data.docId)}`;
  }

  return `job=${shortenValue(job.id)}`;
}

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
    console.log(`WORKER READY | queue=${QUEUE_NAMES.agent} | concurrency=${env.workerConcurrency}`);
  });

  worker.on('completed', job => {
    console.log(`${formatJobLabel(job)} DONE | ${formatJobDetails(job)}`);
  });

  worker.on('failed', (job, error) => {
    if (error && (error.name === 'DelayedError' || error.constructor && error.constructor.name === 'DelayedError')) {
      console.warn(`${formatJobLabel(job)} DEFERRED | ${formatJobDetails(job)}`);
      return;
    }

    if (error && error.code === 'SESSION_MUTATION_LOCK_BUSY') {
      console.warn(`${formatJobLabel(job)} DEFERRED | waiting for session lock | ${formatJobDetails(job)}`);
      return;
    }

    console.error(`${formatJobLabel(job)} FAILED | ${formatJobDetails(job)}`, error);
  });

  return worker;
}

if (require.main === module) {
  startWorker();
}

module.exports = {
  startWorker
};
