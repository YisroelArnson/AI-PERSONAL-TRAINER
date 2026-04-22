/**
 * File overview:
 * Handles queued worker jobs for memory flush pre compaction.
 *
 * Main functions in this file:
 * - handleMemoryFlushPreCompaction: Handles Memory flush pre compaction for this module.
 */

const { flushPreCompactionMemory } = require('../../runtime/services/session-compaction.service');

/**
 * Handles Memory flush pre compaction for this module.
 */
async function handleMemoryFlushPreCompaction(job) {
  const {
    userId,
    sessionKey,
    sessionId,
    timezone,
    messageCount,
    currentCompactionCount
  } = job.data;

  const result = await flushPreCompactionMemory({
    userId,
    sessionKey,
    sessionId,
    timezone,
    messageCount,
    currentCompactionCount
  });

  return {
    sessionId,
    status: result.status
  };
}

module.exports = {
  handleMemoryFlushPreCompaction
};
