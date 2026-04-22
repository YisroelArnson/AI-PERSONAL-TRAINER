/**
 * File overview:
 * Provides infrastructure helpers for queue constants.
 *
 * Main functions in this file:
 * - normalizeJobIdPart: Normalizes Job ID part into the format this file expects.
 * - buildJobEnvelope: Builds a Job envelope used by this file.
 * - buildJobId: Builds a Job ID used by this file.
 * - resolveQueueNameForJobName: Resolves Queue name for job name before the next step runs.
 * - buildAgentRunTurnJobId: Builds an Agent run turn job ID used by this file.
 * - buildSessionMemoryFlushJobId: Builds a Session memory flush job ID used by this file.
 * - buildSessionIndexSyncJobId: Builds a Session index sync job ID used by this file.
 * - buildMemoryDocIndexSyncJobId: Builds a Memory doc index sync job ID used by this file.
 * - buildSessionCompactionJobId: Builds a Session compaction job ID used by this file.
 * - buildDeliverySendJobId: Builds a Delivery send job ID used by this file.
 * - buildDeliveryRetryJobId: Builds a Delivery retry job ID used by this file.
 */

const JOB_SCHEMA_VERSION = 1;

const QUEUE_NAMES = Object.freeze({
  agentRuns: 'agent-runs',
  memoryIndex: 'memory-index',
  sessionMaintenance: 'session-maintenance',
  delivery: 'delivery'
});

const JOB_NAMES = Object.freeze({
  agentRunTurn: 'agent.run_turn',
  memoryIndexSessionDelta: 'memory.index_session_delta',
  memoryIndexDoc: 'memory.index_doc',
  sessionCompact: 'session.compact',
  memoryFlushPreCompaction: 'memory.flush_pre_compaction',
  memoryFlushSessionEnd: 'memory.flush_session_end',
  deliverySend: 'delivery.send',
  deliveryRetry: 'delivery.retry'
});

const JOB_NAME_TO_QUEUE_NAME = Object.freeze({
  [JOB_NAMES.agentRunTurn]: QUEUE_NAMES.agentRuns,
  [JOB_NAMES.memoryIndexSessionDelta]: QUEUE_NAMES.memoryIndex,
  [JOB_NAMES.memoryIndexDoc]: QUEUE_NAMES.memoryIndex,
  [JOB_NAMES.sessionCompact]: QUEUE_NAMES.sessionMaintenance,
  [JOB_NAMES.memoryFlushPreCompaction]: QUEUE_NAMES.sessionMaintenance,
  [JOB_NAMES.memoryFlushSessionEnd]: QUEUE_NAMES.sessionMaintenance,
  [JOB_NAMES.deliverySend]: QUEUE_NAMES.delivery,
  [JOB_NAMES.deliveryRetry]: QUEUE_NAMES.delivery
});

/**
 * Normalizes Job ID part into the format this file expects.
 */
function normalizeJobIdPart(value) {
  const normalized = String(value == null ? '' : value)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9:_-]/g, '-');

  return normalized || 'none';
}

/**
 * Builds a Job envelope used by this file.
 */
function buildJobEnvelope(data = {}) {
  return {
    v: JOB_SCHEMA_VERSION,
    ...data
  };
}

/**
 * Builds a Job ID used by this file.
 */
function buildJobId(jobName, parts = []) {
  return [
    jobName,
    ...parts.map(normalizeJobIdPart)
  ].join('__');
}

/**
 * Resolves Queue name for job name before the next step runs.
 */
function resolveQueueNameForJobName(jobName) {
  const queueName = JOB_NAME_TO_QUEUE_NAME[jobName];

  if (!queueName) {
    throw new Error(`Unsupported job name: ${jobName}`);
  }

  return queueName;
}

/**
 * Builds an Agent run turn job ID used by this file.
 */
function buildAgentRunTurnJobId(runId) {
  return buildJobId(JOB_NAMES.agentRunTurn, [runId]);
}

/**
 * Builds a Session memory flush job ID used by this file.
 */
function buildSessionMemoryFlushJobId({
  sessionKey,
  sessionId = null,
  previousSessionId = null,
  flushKind = 'session_end',
  compactionCount = null
}) {
  return buildJobId(
    flushKind === 'pre_compaction'
      ? JOB_NAMES.memoryFlushPreCompaction
      : JOB_NAMES.memoryFlushSessionEnd,
    [
      sessionKey,
      sessionId || previousSessionId,
      compactionCount != null ? `c${compactionCount}` : null
    ]
  );
}

/**
 * Builds a Session index sync job ID used by this file.
 */
function buildSessionIndexSyncJobId({ sessionKey, sessionId, mode = 'default' }) {
  return buildJobId(JOB_NAMES.memoryIndexSessionDelta, [sessionKey, sessionId, mode]);
}

/**
 * Builds a Memory doc index sync job ID used by this file.
 */
function buildMemoryDocIndexSyncJobId({ docId }) {
  return buildJobId(JOB_NAMES.memoryIndexDoc, [docId]);
}

/**
 * Builds a Session compaction job ID used by this file.
 */
function buildSessionCompactionJobId({ sessionKey, sessionId, nextCompactionCount }) {
  return buildJobId(JOB_NAMES.sessionCompact, [sessionKey, sessionId, `c${nextCompactionCount}`]);
}

/**
 * Builds a Delivery send job ID used by this file.
 */
function buildDeliverySendJobId({ deliveryId }) {
  return buildJobId(JOB_NAMES.deliverySend, [deliveryId]);
}

/**
 * Builds a Delivery retry job ID used by this file.
 */
function buildDeliveryRetryJobId({ deliveryId, attemptCount }) {
  return buildJobId(JOB_NAMES.deliveryRetry, [deliveryId, `attempt${attemptCount}`]);
}

module.exports = {
  JOB_SCHEMA_VERSION,
  JOB_NAMES,
  JOB_NAME_TO_QUEUE_NAME,
  QUEUE_NAMES,
  buildAgentRunTurnJobId,
  buildDeliveryRetryJobId,
  buildDeliverySendJobId,
  buildJobEnvelope,
  buildMemoryDocIndexSyncJobId,
  buildSessionCompactionJobId,
  buildSessionIndexSyncJobId,
  buildSessionMemoryFlushJobId,
  resolveQueueNameForJobName
};
