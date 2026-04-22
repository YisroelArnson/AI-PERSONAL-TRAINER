/**
 * File overview:
 * Handles queued worker jobs for index sync session.
 *
 * Main functions in this file:
 * - handleIndexSyncSession: Handles Index sync session for this module.
 */

const { syncSessionIndex } = require('../../runtime/services/session-indexing.service');

/**
 * Handles Index sync session for this module.
 */
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
