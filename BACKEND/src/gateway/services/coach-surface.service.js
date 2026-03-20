const { buildCoachSurfaceView } = require('../../runtime/services/coach-surface-read.service');

async function getCoachSurface({ auth, query }) {
  return buildCoachSurfaceView({
    userId: auth.userId,
    sessionKey: typeof query.sessionKey === 'string' ? query.sessionKey : undefined
  });
}

module.exports = {
  getCoachSurface
};
