const { hashRequestPayload } = require('../../shared/hash');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');
const { requireIdempotencyKey } = require('../../runtime/services/idempotency.service');
const { persistInboundMessage } = require('../../runtime/services/gateway-ingest.service');
const { getRunById } = require('../../runtime/services/run-state.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const { enqueueSessionMemoryFlushIfNeeded } = require('../../runtime/services/session-memory-queue.service');

async function processInboundMessage({ auth, headers, body }) {
  const idempotencyKey = requireIdempotencyKey(headers);
  const requestHash = hashRequestPayload(body);
  const continuityPolicy = await resolveSessionContinuityPolicy(auth.userId);
  const persisted = await persistInboundMessage({
    userId: auth.userId,
    route: '/v1/messages',
    idempotencyKey,
    requestHash,
    sessionKey: body.sessionKey,
    triggerType: body.triggerType,
    message: body.message,
    metadata: body.metadata,
    sessionResetPolicy: continuityPolicy
  });

  if (persisted.rotated && persisted.previousSessionId) {
    try {
      await enqueueSessionMemoryFlushIfNeeded({
        userId: auth.userId,
        sessionKey: persisted.sessionKey,
        previousSessionId: persisted.previousSessionId,
        rotationReason: persisted.rotationReason,
        continuityPolicy
      });
    } catch (error) {
      console.warn('Unable to enqueue session-end memory flush after ingress rotation:', error.message);
    }
  }

  if (persisted.replayed) {
    const run = await getRunById(persisted.runId);
    const shouldReEnqueue = run.status === 'queued';
    const job = shouldReEnqueue
      ? await enqueueAgentRunTurn({
          runId: persisted.runId,
          userId: auth.userId,
          sessionKey: persisted.sessionKey,
          sessionId: persisted.sessionId
        })
      : null;

    return {
      ...persisted,
      jobId: job ? job.jobId : null,
      streamUrl: `/v1/runs/${persisted.runId}/stream`,
      debug: {
        idempotencyKey,
        requestHash,
        implementationMode: shouldReEnqueue ? 'db-rpc-replayed-reenqueued' : 'db-rpc-replayed',
        sessionResetPolicyCacheHit: continuityPolicy.cacheHit
      }
    };
  }

  const job = await enqueueAgentRunTurn({
    runId: persisted.runId,
    userId: auth.userId,
    sessionKey: persisted.sessionKey,
    sessionId: persisted.sessionId
  });

  return {
    ...persisted,
    jobId: job.jobId,
    streamUrl: `/v1/runs/${persisted.runId}/stream`,
    debug: {
      idempotencyKey,
      requestHash,
      implementationMode: 'db-rpc',
      sessionResetPolicyCacheHit: continuityPolicy.cacheHit
    }
  };
}

module.exports = {
  processInboundMessage
};
