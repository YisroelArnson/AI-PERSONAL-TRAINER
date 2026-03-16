const { randomUUID } = require('node:crypto');

async function createQueuedRun({ userId, sessionKey, sessionId, triggerType }) {
  return {
    runId: randomUUID(),
    userId,
    sessionKey,
    sessionId,
    triggerType,
    status: 'queued',
    mode: 'scaffold'
  };
}

module.exports = {
  createQueuedRun
};
