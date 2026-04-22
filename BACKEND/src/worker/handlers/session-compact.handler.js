/**
 * File overview:
 * Handles queued worker jobs for session compact.
 *
 * Main functions in this file:
 * - handleSessionCompact: Handles Session compact for this module.
 */

const { compactSession } = require('../../runtime/services/session-compaction.service');

/**
 * Handles Session compact for this module.
 */
async function handleSessionCompact(job) {
  const {
    userId,
    sessionKey,
    sessionId,
    nextCompactionCount
  } = job.data;

  const result = await compactSession({
    userId,
    sessionKey,
    sessionId,
    nextCompactionCount
  });

  return {
    sessionId,
    status: result.status,
    nextCompactionCount
  };
}

module.exports = {
  handleSessionCompact
};
