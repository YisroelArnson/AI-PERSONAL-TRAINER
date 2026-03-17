const QUEUE_NAMES = {
  agent: 'agent'
};

const JOB_NAMES = {
  agentRunTurn: 'agent.run_turn'
};

function buildAgentRunTurnJobId(runId) {
  return `${JOB_NAMES.agentRunTurn}__${runId}`;
}

module.exports = {
  QUEUE_NAMES,
  JOB_NAMES,
  buildAgentRunTurnJobId
};
