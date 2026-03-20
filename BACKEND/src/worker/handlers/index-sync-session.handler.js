const { syncSessionIndex } = require('../../runtime/services/session-indexing.service');

async function handleIndexSyncSession(job) {
  const {
    userId,
    sessionKey,
    sessionId
  } = job.data;

  const result = await syncSessionIndex({
    userId,
    sessionKey,
    sessionId
  });

  return {
    sessionKey,
    sessionId,
    status: result.status
  };
}

module.exports = {
  handleIndexSyncSession
};
