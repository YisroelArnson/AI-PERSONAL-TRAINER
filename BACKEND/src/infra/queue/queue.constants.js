const QUEUE_NAMES = {
  agent: 'agent'
};

const JOB_NAMES = {
  agentRunTurn: 'agent.run_turn',
  memoryFlushSessionEnd: 'memory.flush_session_end',
  indexSyncSession: 'index.sync_session',
  indexSyncMemoryDoc: 'index.sync_memory_doc'
};

function buildAgentRunTurnJobId(runId) {
  return `${JOB_NAMES.agentRunTurn}__${runId}`;
}

function buildSessionMemoryFlushJobId({ sessionKey, previousSessionId }) {
  return `${JOB_NAMES.memoryFlushSessionEnd}__${sessionKey}__${previousSessionId}`;
}

function buildSessionIndexSyncJobId({ sessionKey, sessionId, mode = 'default' }) {
  return `${JOB_NAMES.indexSyncSession}__${sessionKey}__${sessionId}__${mode}`;
}

function buildMemoryDocIndexSyncJobId({ docId }) {
  return `${JOB_NAMES.indexSyncMemoryDoc}__${docId}`;
}

module.exports = {
  QUEUE_NAMES,
  JOB_NAMES,
  buildAgentRunTurnJobId,
  buildSessionMemoryFlushJobId,
  buildSessionIndexSyncJobId,
  buildMemoryDocIndexSyncJobId
};
