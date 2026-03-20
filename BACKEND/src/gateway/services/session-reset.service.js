const { hashRequestPayload } = require('../../shared/hash');
const { requireIdempotencyKey } = require('../../runtime/services/idempotency.service');
const { resetSessionHead } = require('../../runtime/services/manual-session-reset.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const { enqueueSessionMemoryFlushIfNeeded } = require('../../runtime/services/session-memory-queue.service');

async function processSessionReset({ auth, headers, body }) {
  const idempotencyKey = requireIdempotencyKey(headers);
  const requestHash = hashRequestPayload(body);
  const continuityPolicy = await resolveSessionContinuityPolicy(auth.userId);
  const resetResult = await resetSessionHead({
    userId: auth.userId,
    route: '/v1/sessions/reset',
    idempotencyKey,
    requestHash,
    sessionKey: body.sessionKey
  });

  if (resetResult.rotated && resetResult.previousSessionId) {
    try {
      await enqueueSessionMemoryFlushIfNeeded({
        userId: auth.userId,
        sessionKey: resetResult.sessionKey,
        previousSessionId: resetResult.previousSessionId,
        rotationReason: resetResult.rotationReason,
        continuityPolicy
      });
    } catch (error) {
      console.warn('Unable to enqueue session-end memory flush after manual reset:', error.message);
    }
  }

  return {
    ...resetResult,
    debug: {
      idempotencyKey,
      requestHash,
      implementationMode: resetResult.replayed ? 'db-rpc-replayed' : 'db-rpc'
    }
  };
}

module.exports = {
  processSessionReset
};
