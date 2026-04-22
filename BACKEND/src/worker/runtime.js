/**
 * File overview:
 * Supports worker startup and job processing for runtime.
 *
 * Main functions in this file:
 * - shortenValue: Handles Shorten value for runtime.js.
 * - shortenUuid: Handles Shorten UUID for runtime.js.
 * - formatJobLabel: Formats Job label for display or logging.
 * - formatJobDetails: Formats Job details for display or logging.
 * - processJob: Processes Job through this file's workflow.
 * - startWorkerRole: Starts Worker role for this module.
 * - startWorkers: Starts Workers for this module.
 */

const { Worker } = require('bullmq');

const { env } = require('../config/env');
const { getRedisConnection } = require('../infra/redis/connection');
const { createSharedWorkerSettings } = require('../infra/queue/queue.config');
const { JOB_NAMES, QUEUE_NAMES } = require('../infra/queue/queue.constants');
const { annotateErrorForQueue, classifyJobError } = require('../runtime/services/job-failure.service');
const { handleAgentRunTurn } = require('./handlers/agent-run-turn.handler');
const { handleDeliveryRetry } = require('./handlers/delivery-retry.handler');
const { handleDeliverySend } = require('./handlers/delivery-send.handler');
const { handleIndexSyncMemoryDoc } = require('./handlers/index-sync-memory-doc.handler');
const { handleIndexSyncSession } = require('./handlers/index-sync-session.handler');
const { handleMemoryFlushPreCompaction } = require('./handlers/memory-flush-pre-compaction.handler');
const { handleMemoryFlushSessionEnd } = require('./handlers/memory-flush-session-end.handler');
const { handleSessionCompact } = require('./handlers/session-compact.handler');
const { startQueueObservers } = require('./queue-observers');

const WORKER_ROLE_CONFIG = Object.freeze({
  agentRuns: {
    queueName: QUEUE_NAMES.agentRuns,
    label: 'agent-runs'
  },
  memoryIndex: {
    queueName: QUEUE_NAMES.memoryIndex,
    label: 'memory-index'
  },
  sessionMaintenance: {
    queueName: QUEUE_NAMES.sessionMaintenance,
    label: 'session-maintenance'
  },
  delivery: {
    queueName: QUEUE_NAMES.delivery,
    label: 'delivery'
  }
});

/**
 * Handles Shorten value for runtime.js.
 */
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

/**
 * Handles Shorten UUID for runtime.js.
 */
function shortenUuid(value) {
  const stringValue = String(value || '');

  if (stringValue.length >= 8) {
    return `${stringValue.slice(0, 8)}…`;
  }

  return stringValue || '-';
}

/**
 * Formats Job label for display or logging.
 */
function formatJobLabel(job) {
  if (!job) {
    return 'JOB';
  }

  if (job.name === JOB_NAMES.agentRunTurn) {
    return `RUN ${shortenUuid(job.data && job.data.runId || job.id)}`;
  }

  if (job.name === JOB_NAMES.memoryFlushSessionEnd || job.name === JOB_NAMES.memoryFlushPreCompaction) {
    return 'MEMORY FLUSH';
  }

  if (job.name === JOB_NAMES.memoryIndexSessionDelta) {
    return 'SESSION INDEX';
  }

  if (job.name === JOB_NAMES.memoryIndexDoc) {
    return 'MEMORY INDEX';
  }

  if (job.name === JOB_NAMES.sessionCompact) {
    return 'SESSION COMPACT';
  }

  if (job.name === JOB_NAMES.deliverySend || job.name === JOB_NAMES.deliveryRetry) {
    return 'DELIVERY';
  }

  return shortenValue(job.name || 'JOB');
}

/**
 * Formats Job details for display or logging.
 */
function formatJobDetails(job) {
  if (!job) {
    return '';
  }

  if (job.name === JOB_NAMES.agentRunTurn) {
    return `run=${shortenUuid(job.data && job.data.runId)}`;
  }

  if (job.name === JOB_NAMES.memoryFlushSessionEnd || job.name === JOB_NAMES.memoryFlushPreCompaction) {
    return `session=${shortenValue(job.data && job.data.sessionKey)} | sessionId=${shortenUuid(job.data && (job.data.sessionId || job.data.previousSessionId))}`;
  }

  if (job.name === JOB_NAMES.memoryIndexSessionDelta) {
    return `session=${shortenValue(job.data && job.data.sessionKey)} | sessionId=${shortenUuid(job.data && job.data.sessionId)}`;
  }

  if (job.name === JOB_NAMES.memoryIndexDoc) {
    return `doc=${shortenUuid(job.data && job.data.docId)}`;
  }

  if (job.name === JOB_NAMES.sessionCompact) {
    return `session=${shortenValue(job.data && job.data.sessionKey)} | compaction=${job.data && job.data.nextCompactionCount}`;
  }

  if (job.name === JOB_NAMES.deliverySend || job.name === JOB_NAMES.deliveryRetry) {
    return `delivery=${shortenUuid(job.data && job.data.deliveryId)} | run=${shortenUuid(job.data && job.data.runId)}`;
  }

  return `job=${shortenValue(job.id)}`;
}

/**
 * Processes Job through this file's workflow.
 */
async function processJob(job, token) {
  try {
    if (job.name === JOB_NAMES.agentRunTurn) {
      return await handleAgentRunTurn(job, token);
    }

    if (job.name === JOB_NAMES.memoryFlushSessionEnd) {
      return await handleMemoryFlushSessionEnd(job);
    }

    if (job.name === JOB_NAMES.memoryFlushPreCompaction) {
      return await handleMemoryFlushPreCompaction(job);
    }

    if (job.name === JOB_NAMES.memoryIndexSessionDelta) {
      return await handleIndexSyncSession(job);
    }

    if (job.name === JOB_NAMES.memoryIndexDoc) {
      return await handleIndexSyncMemoryDoc(job);
    }

    if (job.name === JOB_NAMES.sessionCompact) {
      return await handleSessionCompact(job);
    }

    if (job.name === JOB_NAMES.deliverySend) {
      return await handleDeliverySend(job);
    }

    if (job.name === JOB_NAMES.deliveryRetry) {
      return await handleDeliveryRetry(job);
    }

    throw new Error(`Unsupported job name: ${job.name}`);
  } catch (error) {
    const failure = classifyJobError(error);

    if (failure.shouldDiscard && typeof job.discard === 'function') {
      job.discard();
    }

    throw annotateErrorForQueue(error, failure.failureClass);
  }
}

/**
 * Starts Worker role for this module.
 */
function startWorkerRole(roleName) {
  const roleConfig = WORKER_ROLE_CONFIG[roleName];
  const connection = getRedisConnection();

  if (!roleConfig) {
    throw new Error(`Unsupported worker role: ${roleName}`);
  }

  if (!connection) {
    throw new Error('REDIS_URL is not configured');
  }

  const worker = new Worker(roleConfig.queueName, processJob, {
    connection,
    concurrency: env.workerConcurrency,
    settings: createSharedWorkerSettings()
  });

  worker.on('ready', () => {
    console.log(`WORKER READY | role=${roleName} | queue=${roleConfig.queueName} | concurrency=${env.workerConcurrency}`);
  });

  worker.on('completed', job => {
    console.log(`${formatJobLabel(job)} DONE | ${formatJobDetails(job)}`);
  });

  worker.on('failed', (job, error) => {
    if (error && (error.name === 'DelayedError' || error.constructor && error.constructor.name === 'DelayedError')) {
      console.warn(`${formatJobLabel(job)} DEFERRED | ${formatJobDetails(job)}`);
      return;
    }

    console.error(`${formatJobLabel(job)} FAILED | ${formatJobDetails(job)}`, error);
  });

  return worker;
}

/**
 * Starts Workers for this module.
 */
function startWorkers(roleNames = Object.keys(WORKER_ROLE_CONFIG)) {
  const queueNames = [...new Set(roleNames.map(roleName => WORKER_ROLE_CONFIG[roleName].queueName))];
  const observers = startQueueObservers(queueNames);
  const workers = roleNames.map(startWorkerRole);

  return {
    observers,
    workers
  };
}

module.exports = {
  WORKER_ROLE_CONFIG,
  startWorkerRole,
  startWorkers
};
