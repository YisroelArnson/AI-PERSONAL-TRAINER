/**
 * File overview:
 * Implements the message ingress service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - buildAcceptedResponse: Builds an Accepted response used by this file.
 * - processInboundMessage: Processes Inbound message through this file's workflow.
 */

const { hashRequestPayload } = require('../../shared/hash');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');
const { requireIdempotencyKey, lookupIdempotencyResponse } = require('../../runtime/services/idempotency.service');
const { persistInboundMessage } = require('../../runtime/services/gateway-ingest.service');
const { getRunById } = require('../../runtime/services/run-state.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const { resolveRetrievalPolicy } = require('../../runtime/services/retrieval-policy.service');
const { resolveRateLimitPolicy } = require('../../runtime/services/rate-limit-policy.service');
const { resolveConcurrencyPolicy } = require('../../runtime/services/concurrency-policy.service');
const { enqueueSessionMemoryFlushIfNeeded } = require('../../runtime/services/session-memory-queue.service');
const { enqueueSessionIndexSyncIfNeeded } = require('../../runtime/services/indexing-queue.service');
const { enqueueSessionCompactionIfNeeded } = require('../../runtime/services/session-compaction.service');
const { resolveEffectiveLlmSelection } = require('../../runtime/services/llm-config.service');
const { startTimer } = require('../../runtime/services/performance-log.service');
const {
  admitMessageRequest,
  releaseMessageRateLimitReservation
} = require('./message-rate-limit.service');
const {
  admitActiveRun,
  releaseActiveRunReservation,
  bindRunConcurrencyReservation
} = require('./concurrency-admission.service');

const MESSAGE_ROUTE = '/v1/messages';

/**
 * Builds an Accepted response used by this file.
 */
async function buildAcceptedResponse({
  persisted,
  userId,
  idempotencyKey,
  requestHash,
  continuityPolicy,
  retrievalPolicy,
  rateLimitPolicy,
  concurrencyPolicy,
  requestId,
  rateLimitBypassedForReplay = false,
  rateLimitTokensRefunded = false,
  concurrencyGateBypassedForReplay = false
}) {
  if (persisted.replayed) {
    const run = await getRunById(persisted.runId);
    const shouldReEnqueue = run.status === 'queued';
    let job = null;
    const finishQueue = startTimer({
      requestId: requestId || null,
      route: MESSAGE_ROUTE,
      stage: 'queue_enqueue',
      userId,
      runId: persisted.runId
    });

    try {
      job = shouldReEnqueue
        ? await enqueueAgentRunTurn({
            runId: persisted.runId,
            userId,
            sessionKey: persisted.sessionKey,
            sessionId: persisted.sessionId
          })
        : null;
      finishQueue({
        outcome: 'ok',
        replayed: true,
        enqueued: Boolean(job)
      });
    } catch (error) {
      finishQueue({
        outcome: 'error',
        replayed: true,
        enqueued: false,
        errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
      });
      throw error;
    }

    return {
      ...persisted,
      jobId: job ? job.jobId : null,
      streamUrl: `/v1/runs/${persisted.runId}/stream`,
      debug: {
        idempotencyKey,
        requestHash,
        implementationMode: shouldReEnqueue ? 'db-rpc-replayed-reenqueued' : 'db-rpc-replayed',
        sessionResetPolicyCacheHit: continuityPolicy.cacheHit,
        retrievalPolicyCacheHit: retrievalPolicy.cacheHit,
        rateLimitPolicyCacheHit: rateLimitPolicy.cacheHit,
        concurrencyPolicyCacheHit: concurrencyPolicy.cacheHit,
        rateLimitBypassedForReplay,
        rateLimitTokensRefunded,
        concurrencyGateBypassedForReplay
      }
    };
  }

  let job;
  const finishQueue = startTimer({
    requestId: requestId || null,
    route: MESSAGE_ROUTE,
    stage: 'queue_enqueue',
    userId,
    runId: persisted.runId
  });

  try {
    console.log('enqueueing agent run turn');
    job = await enqueueAgentRunTurn({
      runId: persisted.runId,
      userId,
      sessionKey: persisted.sessionKey,
      sessionId: persisted.sessionId
    });
    finishQueue({
      outcome: 'ok',
      replayed: false,
      enqueued: true
    });
  } catch (error) {
    finishQueue({
      outcome: 'error',
      replayed: false,
      enqueued: false,
      errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
    });
    throw error;
  }

  return {
    ...persisted,
    jobId: job.jobId,
    streamUrl: `/v1/runs/${persisted.runId}/stream`,
    debug: {
      idempotencyKey,
      requestHash,
      implementationMode: 'db-rpc',
      sessionResetPolicyCacheHit: continuityPolicy.cacheHit,
      retrievalPolicyCacheHit: retrievalPolicy.cacheHit,
      rateLimitPolicyCacheHit: rateLimitPolicy.cacheHit,
      concurrencyPolicyCacheHit: concurrencyPolicy.cacheHit,
      rateLimitBypassedForReplay,
      rateLimitTokensRefunded,
      concurrencyGateBypassedForReplay
    }
  };
}

/**
 * Processes Inbound message through this file's workflow.
 */
async function processInboundMessage({ auth, headers, body, ipAddress, requestId }) {
  console.log('top of processInboundMessage');
  const idempotencyKey = requireIdempotencyKey(headers);
  const requestHash = hashRequestPayload(body);
  const replayedResponse = await lookupIdempotencyResponse({
    userId: auth.userId,
    route: MESSAGE_ROUTE,
    idempotencyKey,
    requestHash
  });
  const finishPolicyResolution = startTimer({
    requestId: requestId || null,
    route: MESSAGE_ROUTE,
    stage: 'policy_resolution',
    userId: auth.userId
  });
  let continuityPolicy;
  let retrievalPolicy;
  let rateLimitPolicy;
  let concurrencyPolicy;

  try {
    [continuityPolicy, retrievalPolicy, rateLimitPolicy, concurrencyPolicy] = await Promise.all([
      resolveSessionContinuityPolicy(auth.userId),
      resolveRetrievalPolicy(auth.userId),
      resolveRateLimitPolicy(auth.userId),
      resolveConcurrencyPolicy(auth.userId)
    ]);
    finishPolicyResolution({
      outcome: 'ok',
      replayed: Boolean(replayedResponse)
    });
  } catch (error) {
    finishPolicyResolution({
      outcome: 'error',
      replayed: Boolean(replayedResponse),
      errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
    });
    throw error;
  }

  if (replayedResponse) {
    return buildAcceptedResponse({
      persisted: replayedResponse,
      userId: auth.userId,
      idempotencyKey,
      requestHash,
      continuityPolicy,
      retrievalPolicy,
      rateLimitPolicy,
      concurrencyPolicy,
      requestId,
      rateLimitBypassedForReplay: true,
      concurrencyGateBypassedForReplay: true
    });
  }

  const admission = await admitMessageRequest({
    userId: auth.userId,
    headers,
    ipAddress,
    rateLimitPolicy
  });
  let activeRunReservation = null;
  let persisted;
  const effectiveLlm = await resolveEffectiveLlmSelection({
    userId: auth.userId,
    requestedLlm: body.llm || null
  });
  try {
    activeRunReservation = await admitActiveRun({
      userId: auth.userId,
      idempotencyKey,
      concurrencyPolicy,
      route: MESSAGE_ROUTE
    });

    const finishIngest = startTimer({
      requestId: requestId || null,
      route: MESSAGE_ROUTE,
      stage: 'message_ingest_rpc',
      userId: auth.userId
    });
    try {
      persisted = await persistInboundMessage({
        userId: auth.userId,
        route: MESSAGE_ROUTE,
        idempotencyKey,
        requestHash,
        sessionKey: body.sessionKey,
        triggerType: body.triggerType,
        message: body.message,
        metadata: {
          ...(body.metadata || {}),
          llm: effectiveLlm
        },
        sessionResetPolicy: continuityPolicy
      });
      finishIngest({
        outcome: 'ok',
        runId: persisted.runId,
        replayed: Boolean(persisted.replayed),
        rotated: Boolean(persisted.rotated)
      });
    } catch (error) {
      finishIngest({
        outcome: 'error',
        errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
      });
      throw error;
    }
  } catch (error) {
    try {
      await releaseMessageRateLimitReservation(admission.reservation);
    } catch (refundError) {
      console.warn('Unable to refund rate-limit tokens after message ingest failure:', refundError.message);
    }

    if (activeRunReservation) {
      try {
        await releaseActiveRunReservation(activeRunReservation);
      } catch (releaseError) {
        console.warn('Unable to release active-run reservation after message ingest failure:', releaseError.message);
      }
    }

    throw error;
  }

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

  try {
    await enqueueSessionIndexSyncIfNeeded({
      userId: auth.userId,
      sessionKey: persisted.sessionKey,
      sessionId: persisted.sessionId,
      retrievalPolicy
    });
  } catch (error) {
    console.warn('Unable to enqueue session indexing job after ingress append:', error.message);
  }

  try {
    await enqueueSessionCompactionIfNeeded({
      userId: auth.userId,
      sessionKey: persisted.sessionKey,
      sessionId: persisted.sessionId
    });
  } catch (error) {
    console.warn('Unable to enqueue session compaction job after ingress append:', error.message);
  }

  let rateLimitTokensRefunded = false;
  if (persisted.replayed) {
    try {
      await releaseMessageRateLimitReservation(admission.reservation);
      rateLimitTokensRefunded = true;
    } catch (error) {
      console.warn('Unable to refund rate-limit tokens for replayed message admission:', error.message);
    }

    try {
      await releaseActiveRunReservation(activeRunReservation);
    } catch (error) {
      console.warn('Unable to release active-run reservation for replayed message admission:', error.message);
    }
  } else {
    try {
      await bindRunConcurrencyReservation({
        runId: persisted.runId,
        reservation: activeRunReservation
      });
    } catch (error) {
      console.warn('Unable to bind active-run reservation to run id:', error.message);
    }
  }

  return buildAcceptedResponse({
    persisted,
    userId: auth.userId,
    idempotencyKey,
    requestHash,
    continuityPolicy,
    retrievalPolicy,
    rateLimitPolicy,
    concurrencyPolicy,
    requestId,
    rateLimitTokensRefunded
  });
}

module.exports = {
  processInboundMessage
};
