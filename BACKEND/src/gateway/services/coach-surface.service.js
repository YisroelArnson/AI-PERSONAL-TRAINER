const { buildCoachSurfaceView } = require('../../runtime/services/coach-surface-read.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const { enqueueSessionMemoryFlushIfNeeded } = require('../../runtime/services/session-memory-queue.service');
const { startTimer } = require('../../runtime/services/performance-log.service');

async function getCoachSurface({ auth, query, requestId }) {
  const finish = startTimer({
    requestId: requestId || null,
    route: '/v1/coach-surface',
    stage: 'coach_surface_build',
    userId: auth.userId
  });

  try {
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

    finish({
      outcome: 'ok',
      sessionKey: view.sessionKey,
      hasActiveRun: Boolean(view.activeRun),
      hasWorkout: Boolean(view.workout),
      feedCount: Array.isArray(view.feed) ? view.feed.length : 0
    });

    return view;
  } catch (error) {
    finish({
      outcome: 'error',
      errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
    });
    throw error;
  }
}

module.exports = {
  getCoachSurface
};
