/**
 * File overview:
 * Provides infrastructure helpers for queue config.
 *
 * Main functions in this file:
 * - resolveQueueRetrySettings: Resolves Queue retry settings before the next step runs.
 * - createSharedJobOptions: Creates a Shared job options used by this file.
 * - computeRetryDelayMs: Handles Compute retry delay ms for queue.config.js.
 * - createSharedWorkerSettings: Creates a Shared worker settings used by this file.
 */

const { env } = require('../../config/env');

/**
 * Resolves Queue retry settings before the next step runs.
 */
function resolveQueueRetrySettings() {
  const maxAttempts = Math.max(1, Number(env.queueRetryMaxAttempts || 8));
  const baseDelayMs = Math.max(1000, Number(env.queueRetryBaseDelayMs || 1000));
  const maxDelayMs = Math.max(baseDelayMs, Number(env.queueRetryMaxDelayMs || 300000));

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitter: 0.5
  };
}

/**
 * Creates a Shared job options used by this file.
 */
function createSharedJobOptions() {
  const retry = resolveQueueRetrySettings();

  return {
    attempts: retry.maxAttempts,
    backoff: {
      type: 'pt_exponential',
      delay: retry.baseDelayMs
    },
    removeOnComplete: {
      age: 60 * 60 * 24,
      count: 1000
    },
    removeOnFail: {
      age: 60 * 60 * 24 * 7,
      count: 5000
    }
  };
}

/**
 * Handles Compute retry delay ms for queue.config.js.
 */
function computeRetryDelayMs(attemptsMade, seedDelayMs = null) {
  const retry = resolveQueueRetrySettings();
  const baseDelayMs = Math.max(retry.baseDelayMs, Number(seedDelayMs) || retry.baseDelayMs);
  const attemptNumber = Math.max(1, Number(attemptsMade) || 1);
  const uncappedDelayMs = baseDelayMs * (2 ** Math.max(0, attemptNumber - 1));
  const cappedDelayMs = Math.min(retry.maxDelayMs, uncappedDelayMs);
  const jitterFloor = 1 - retry.jitter;

  return Math.max(
    retry.baseDelayMs,
    Math.round(cappedDelayMs * (jitterFloor + (Math.random() * retry.jitter)))
  );
}

/**
 * Creates a Shared worker settings used by this file.
 */
function createSharedWorkerSettings() {
  return {
    maxStalledCount: 1,
    backoffStrategy(attemptsMade, type, err, job) {
      if (type !== 'pt_exponential') {
        return undefined;
      }

      return computeRetryDelayMs(
        attemptsMade,
        job && job.opts && job.opts.backoff ? job.opts.backoff.delay : null
      );
    }
  };
}

module.exports = {
  computeRetryDelayMs,
  createSharedJobOptions,
  createSharedWorkerSettings,
  resolveQueueRetrySettings
};
