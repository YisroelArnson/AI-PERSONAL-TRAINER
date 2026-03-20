const { enqueueSessionMemoryFlush } = require('../../infra/queue/agent.queue');
const { resolveSessionContinuityPolicy } = require('./session-reset-policy.service');

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
