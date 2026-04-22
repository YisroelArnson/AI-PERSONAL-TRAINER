/**
 * File overview:
 * Implements runtime service logic for session memory queue.
 *
 * Main functions in this file:
 * - enqueueSessionMemoryFlushIfNeeded: Enqueues Session memory flush if needed for asynchronous work.
 */

const { enqueueSessionMemoryFlush } = require('../../infra/queue/agent.queue');
const { resolveSessionContinuityPolicy } = require('./session-reset-policy.service');

/**
 * Enqueues Session memory flush if needed for asynchronous work.
 */
async function enqueueSessionMemoryFlushIfNeeded({
  userId,
  sessionKey,
  previousSessionId,
  rotationReason,
  continuityPolicy
}) {
  if (!previousSessionId) {
    return null;
  }

  const policy = continuityPolicy || await resolveSessionContinuityPolicy(userId);

  if (!policy.sessionMemoryEnabled) {
    return null;
  }

  return enqueueSessionMemoryFlush({
    userId,
    sessionKey,
    previousSessionId,
    rotationReason,
    timezone: policy.timezone,
    messageCount: policy.sessionMemoryMessageCount
  });
}

module.exports = {
  enqueueSessionMemoryFlushIfNeeded
};
