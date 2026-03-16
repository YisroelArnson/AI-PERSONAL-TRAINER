const { randomUUID } = require('node:crypto');

async function enqueueAgentRunTurn({ runId, userId, sessionKey, sessionId }) {
  return {
    jobId: randomUUID(),
    queueName: 'agent',
    jobName: 'agent.run_turn',
    payload: {
      runId,
      userId,
      sessionKey,
      sessionId
    },
    mode: 'scaffold'
  };
}

module.exports = {
  enqueueAgentRunTurn
};
