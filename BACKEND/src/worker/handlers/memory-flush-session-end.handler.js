/**
 * File overview:
 * Handles queued worker jobs for memory flush session end.
 *
 * Main functions in this file:
 * - handleMemoryFlushSessionEnd: Handles Memory flush session end for this module.
 */

const { flushSessionMemoryToEpisodicDate } = require('../../runtime/services/session-memory-flush.service');

/**
 * Handles Memory flush session end for this module.
 */
async function handleMemoryFlushSessionEnd(job) {
  const {
    userId,
    sessionKey,
    previousSessionId,
    rotationReason,
    timezone,
    messageCount
  } = job.data;

  const result = await flushSessionMemoryToEpisodicDate({
    userId,
    sessionKey,
    previousSessionId,
    rotationReason,
    timezone,
    messageCount
  });

  return {
    previousSessionId,
    status: result.status
  };
}

module.exports = {
  handleMemoryFlushSessionEnd
};
