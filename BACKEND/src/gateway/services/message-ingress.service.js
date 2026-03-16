const { requireIdempotencyKey } = require('../../runtime/services/idempotency.service');
const { resolveSession } = require('../../runtime/services/session.service');
const { appendInboundEvent } = require('../../runtime/services/transcript.service');
const { createQueuedRun } = require('../../runtime/services/run.service');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');

async function processInboundMessage({ auth, headers, body }) {
  const idempotencyKey = requireIdempotencyKey(headers);

  const session = await resolveSession({
    userId: auth.userId,
    sessionKey: body.sessionKey
  });

  const event = await appendInboundEvent({
    userId: auth.userId,
    sessionKey: session.sessionKey,
    sessionId: session.sessionId,
    triggerType: body.triggerType,
    message: body.message,
    metadata: body.metadata,
    idempotencyKey
  });

  const run = await createQueuedRun({
    userId: auth.userId,
    sessionKey: session.sessionKey,
    sessionId: session.sessionId,
    triggerType: body.triggerType
  });

  const job = await enqueueAgentRunTurn({
    runId: run.runId,
    userId: auth.userId,
    sessionKey: session.sessionKey,
    sessionId: session.sessionId
  });

  return {
    status: 'accepted',
    sessionKey: session.sessionKey,
    sessionId: session.sessionId,
    runId: run.runId,
    jobId: job.jobId,
    streamUrl: `/v1/runs/${run.runId}/stream`,
    debug: {
      idempotencyKey,
      eventId: event.eventId,
      implementationMode: 'scaffold'
    }
  };
}

module.exports = {
  processInboundMessage
};
