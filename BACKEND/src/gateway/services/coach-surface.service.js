const { buildCoachSurfaceView } = require('../../runtime/services/coach-surface-read.service');
const { resolveSessionResetPolicy } = require('../../runtime/services/session-reset-policy.service');

async function getCoachSurface({ auth, query }) {
  const sessionResetPolicy = await resolveSessionResetPolicy(auth.userId);

  return buildCoachSurfaceView({
    userId: auth.userId,
    sessionKey: typeof query.sessionKey === 'string' ? query.sessionKey : undefined,
    sessionResetPolicy
  });
}

module.exports = {
  getCoachSurface
};
