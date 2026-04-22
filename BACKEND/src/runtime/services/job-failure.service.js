/**
 * File overview:
 * Implements runtime service logic for job failure.
 *
 * Main functions in this file:
 * - normalizeErrorMessage: Normalizes Error message into the format this file expects.
 * - classifyJobError: Handles Classify job error for job-failure.service.js.
 * - annotateErrorForQueue: Handles Annotate error for queue for job-failure.service.js.
 * - isTerminalJobFailure: Handles Is terminal job failure for job-failure.service.js.
 */

class PermanentJobError extends Error {
  constructor(message = 'Permanent job failure', options = {}) {
    super(message);
    this.name = 'PermanentJobError';
    this.code = options.code || null;
    this.failureClass = 'permanent';
  }
}

/**
 * Normalizes Error message into the format this file expects.
 */
function normalizeErrorMessage(error) {
  return error && error.message ? String(error.message) : 'Unknown job failure';
}

/**
 * Handles Classify job error for job-failure.service.js.
 */
function classifyJobError(error) {
  if (!error) {
    return {
      failureClass: 'transient',
      shouldDiscard: false
    };
  }

  if (
    error.name === 'DelayedError'
    || error.failureClass === 'deferred'
  ) {
    return {
      failureClass: 'deferred',
      shouldDiscard: false
    };
  }

  if (error.errorClass === 'rate_limited') {
    return {
      failureClass: 'deferred',
      shouldDiscard: false
    };
  }

  if (error instanceof PermanentJobError || error.failureClass === 'permanent') {
    return {
      failureClass: 'permanent',
      shouldDiscard: true
    };
  }

  return {
    failureClass: 'transient',
    shouldDiscard: false
  };
}

/**
 * Handles Annotate error for queue for job-failure.service.js.
 */
function annotateErrorForQueue(error, failureClass) {
  if (!error || failureClass !== 'permanent') {
    return error;
  }

  if (!String(error.message || '').startsWith('[permanent] ')) {
    error.message = `[permanent] ${normalizeErrorMessage(error)}`;
  }

  error.failureClass = 'permanent';
  return error;
}

/**
 * Handles Is terminal job failure for job-failure.service.js.
 */
function isTerminalJobFailure(job, failedReason = '') {
  const maxAttempts = Math.max(1, Number(job && job.opts && job.opts.attempts ? job.opts.attempts : 1));
  const attemptsMade = Math.max(0, Number(job && job.attemptsMade ? job.attemptsMade : 0));

  if (String(failedReason || '').startsWith('[permanent] ')) {
    return true;
  }

  return attemptsMade >= maxAttempts;
}

module.exports = {
  PermanentJobError,
  annotateErrorForQueue,
  classifyJobError,
  isTerminalJobFailure,
  normalizeErrorMessage
};
