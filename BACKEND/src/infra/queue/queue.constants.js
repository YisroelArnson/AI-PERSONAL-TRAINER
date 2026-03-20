const QUEUE_NAMES = {
  agent: 'agent'
};

const JOB_NAMES = {
  agentRunTurn: 'agent.run_turn',
  memoryFlushSessionEnd: 'memory.flush_session_end'
};

function buildAgentRunTurnJobId(runId) {
  return `${JOB_NAMES.agentRunTurn}__${runId}`;
}

function buildSessionMemoryFlushJobId({ sessionKey, previousSessionId }) {
  return `${JOB_NAMES.memoryFlushSessionEnd}__${sessionKey}__${previousSessionId}`;
}

module.exports = {
  QUEUE_NAMES,
  JOB_NAMES,
  buildAgentRunTurnJobId,
  buildSessionMemoryFlushJobId
};
