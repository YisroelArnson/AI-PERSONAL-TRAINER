const { buildCoachSurfaceView } = require('../../runtime/services/coach-surface-read.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const { enqueueSessionMemoryFlushIfNeeded } = require('../../runtime/services/session-memory-queue.service');

async function getCoachSurface({ auth, query }) {
  const continuityPolicy = await resolveSessionContinuityPolicy(auth.userId);
  const { view, sessionBoundary } = await buildCoachSurfaceView({
    userId: auth.userId,
    sessionKey: typeof query.sessionKey === 'string' ? query.sessionKey : undefined,
    sessionResetPolicy: continuityPolicy
  });

  if (sessionBoundary && sessionBoundary.rotated && sessionBoundary.previousSessionId) {
    try {
      await enqueueSessionMemoryFlushIfNeeded({
        userId: auth.userId,
        sessionKey: sessionBoundary.sessionKey,
        previousSessionId: sessionBoundary.previousSessionId,
        rotationReason: sessionBoundary.rotationReason,
        continuityPolicy
      });
    } catch (error) {
      console.warn('Unable to enqueue session-end memory flush after coach-surface rotation:', error.message);
    }
  }

  return view;
}

module.exports = {
  getCoachSurface
};
