const { flushSessionMemoryToEpisodicDate } = require('../../runtime/services/session-memory-flush.service');

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
