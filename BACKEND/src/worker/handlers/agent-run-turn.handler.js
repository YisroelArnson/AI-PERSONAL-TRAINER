/**
 * File overview:
 * Handles queued worker jobs for agent run turn.
 *
 * Main functions in this file:
 * - startHeartbeat: Starts Heartbeat for this module.
 * - normalizeDelayMs: Normalizes Delay ms into the format this file expects.
 * - getJobAttemptState: Gets Job attempt state needed by this file.
 * - moveJobToDelayedOrThrow: Handles Move job to delayed or throw for agent-run-turn.handler.js.
 * - enqueueFinalRunDelivery: Enqueues Final run delivery for asynchronous work.
 * - readHeaderValue: Reads Header value from its source.
 * - parseRetryAfterMs: Parses Retry after ms into a validated shape.
 * - parseResetDelayMs: Parses Reset delay ms into a validated shape.
 * - resolveAnthropicResetDelayMs: Resolves Anthropic reset delay ms before the next step runs.
 * - resolveRateLimitDelayMs: Resolves Rate limit delay ms before the next step runs.
 * - deferRateLimitedRun: Handles Defer rate limited run for agent-run-turn.handler.js.
 * - deferRetryableFailure: Handles Defer retryable failure for agent-run-turn.handler.js.
 * - handleAgentRunTurn: Handles Agent run turn for this module.
 * - emitStreamEvent: Handles Emit stream event for agent-run-turn.handler.js.
 */

const { performance } = require('node:perf_hooks');
const { DelayedError } = require('bullmq');

const {
  flushBufferedRunStreamEvents,
  publishHotStreamEvent
} = require('../../runtime/services/stream-events.service');
const { runAgentTurn } = require('../../runtime/agent-runtime/run-agent-turn');
const { resolveEffectiveLlmSelectionForRun } = require('../../runtime/services/llm-config.service');
const { logPerformance, startTimer } = require('../../runtime/services/performance-log.service');
const { resolveConcurrencyPolicy } = require('../../runtime/services/concurrency-policy.service');
const {
  refreshActiveRunLease,
  releaseActiveRunLease
} = require('../../gateway/services/concurrency-admission.service');
const { ERROR_CLASSES } = require('../../runtime/agent-runtime/types');
const {
  getRunById,
  markRunFailed,
  markRunRunning,
  markRunSucceeded
} = require('../../runtime/services/run-state.service');
const {
  buildNormalizedRunDeliveryPayload,
  upsertRunDeliveryOutbox
} = require('../../runtime/services/delivery-outbox.service');
const { enqueueDeliverySend } = require('../../infra/queue/agent.queue');
const {
  annotateErrorForQueue,
  classifyJobError
} = require('../../runtime/services/job-failure.service');

const RUN_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;
const RATE_LIMIT_RETRY_FALLBACK_MS = 60 * 1000;
const RATE_LIMIT_RETRY_BUFFER_MS = 1000;

/**
 * Starts Heartbeat for this module.
 */
function startHeartbeat(fn, intervalMs, label) {
  const timer = setInterval(async () => {
    try {
      await fn();
    } catch (error) {
      console.warn(`${label} failed:`, error.message);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

/**
 * Normalizes Delay ms into the format this file expects.
 */
function normalizeDelayMs(delayMs, fallbackMs) {
  const normalizedFallbackMs = Math.max(1000, Math.floor(Number(fallbackMs) || 1000));
  const normalizedDelayMs = Number(delayMs);

  if (!Number.isFinite(normalizedDelayMs) || normalizedDelayMs < 0) {
    return normalizedFallbackMs;
  }

  return Math.max(1000, Math.floor(normalizedDelayMs));
}

/**
 * Gets Job attempt state needed by this file.
 */
function getJobAttemptState(job) {
  const currentAttempt = Math.max(1, Number(job && job.attemptsMade != null ? job.attemptsMade : 0) + 1);
  const maxAttempts = Math.max(1, Number(job && job.opts && job.opts.attempts ? job.opts.attempts : 1));

  return {
    currentAttempt,
    maxAttempts,
    isFinalAttempt: currentAttempt >= maxAttempts
  };
}

/**
 * Handles Move job to delayed or throw for agent-run-turn.handler.js.
 */
async function moveJobToDelayedOrThrow(job, token, delayMs, fallbackMs) {
  if (token && typeof job.moveToDelayed === 'function') {
    await job.moveToDelayed(
      Date.now() + normalizeDelayMs(delayMs, fallbackMs),
      token
    );
    throw new DelayedError();
  }
}

/**
 * Enqueues Final run delivery for asynchronous work.
 */
async function enqueueFinalRunDelivery({ run, outputText = null, error = null }) {
  const payload = await buildNormalizedRunDeliveryPayload({
    run,
    outputText,
    error
  });
  const deliveryRecord = await upsertRunDeliveryOutbox({
    run,
    payload,
    status: 'pending'
  });

  await enqueueDeliverySend({
    deliveryId: deliveryRecord.delivery_id,
    runId: run.run_id,
    userId: run.user_id
  });

  return deliveryRecord;
}

/**
 * Reads Header value from its source.
 */
function readHeaderValue(headers, headerName) {
  if (!headers || !headerName) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get(headerName);
  }

  const normalizedHeaderName = String(headerName).trim().toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).trim().toLowerCase() === normalizedHeaderName) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return null;
}

/**
 * Parses Retry after ms into a validated shape.
 */
function parseRetryAfterMs(headers) {
  const rawValue = readHeaderValue(headers, 'retry-after');

  if (!rawValue) {
    return null;
  }

  const trimmed = String(rawValue).trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.ceil(Number(trimmed) * 1000));
  }

  const retryAt = Date.parse(trimmed);

  if (!Number.isFinite(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

/**
 * Parses Reset delay ms into a validated shape.
 */
function parseResetDelayMs(headers, headerName) {
  const rawValue = readHeaderValue(headers, headerName);

  if (!rawValue) {
    return null;
  }

  const resetAt = Date.parse(String(rawValue).trim());

  if (!Number.isFinite(resetAt)) {
    return null;
  }

  return Math.max(0, resetAt - Date.now());
}

/**
 * Resolves Anthropic reset delay ms before the next step runs.
 */
function resolveAnthropicResetDelayMs(error) {
  const message = String(error && error.message ? error.message : '').toLowerCase();
  const headers = error && error.headers ? error.headers : null;
  const orderedHeaderNames = [];

  if (message.includes('input token')) {
    orderedHeaderNames.push('anthropic-ratelimit-input-tokens-reset');
  } else if (message.includes('output token')) {
    orderedHeaderNames.push('anthropic-ratelimit-output-tokens-reset');
  } else if (message.includes('request')) {
    orderedHeaderNames.push('anthropic-ratelimit-requests-reset');
  }

  orderedHeaderNames.push(
    'anthropic-ratelimit-input-tokens-reset',
    'anthropic-ratelimit-output-tokens-reset',
    'anthropic-ratelimit-requests-reset'
  );

  for (const headerName of [...new Set(orderedHeaderNames)]) {
    const delayMs = parseResetDelayMs(headers, headerName);

    if (delayMs !== null) {
      return delayMs;
    }
  }

  return null;
}

/**
 * Resolves Rate limit delay ms before the next step runs.
 */
function resolveRateLimitDelayMs(error) {
  const headers = error && error.headers ? error.headers : null;
  const retryAfterMs = parseRetryAfterMs(headers);

  if (retryAfterMs !== null) {
    return retryAfterMs + RATE_LIMIT_RETRY_BUFFER_MS;
  }

  const resetDelayMs = resolveAnthropicResetDelayMs(error);

  if (resetDelayMs !== null) {
    return resetDelayMs + RATE_LIMIT_RETRY_BUFFER_MS;
  }

  return RATE_LIMIT_RETRY_FALLBACK_MS;
}

/**
 * Handles Defer rate limited run for agent-run-turn.handler.js.
 */
async function deferRateLimitedRun(job, token, runId, error, appendEvent = null) {
  const retryDelayMs = resolveRateLimitDelayMs(error);
  const retryAt = new Date(Date.now() + retryDelayMs).toISOString();

  try {
    const append = appendEvent || (payload => publishHotStreamEvent(payload));
    await append({
      runId,
      eventType: 'run.deferred',
      payload: {
        phase: 'worker',
        reason: ERROR_CLASSES.rateLimited,
        retryDelayMs,
        retryAt,
        message: error && error.message ? error.message.slice(0, 1000) : 'Provider rate limited'
      }
    });
  } catch (streamError) {
    console.warn(`Unable to append run.deferred stream event for ${runId}:`, streamError.message);
  }

  await moveJobToDelayedOrThrow(job, token, retryDelayMs, RATE_LIMIT_RETRY_FALLBACK_MS);

  return false;
}

/**
 * Handles Defer retryable failure for agent-run-turn.handler.js.
 */
async function deferRetryableFailure({ runId, error, currentAttempt, maxAttempts }) {
  try {
    await publishHotStreamEvent({
      runId,
      eventType: 'run.deferred',
      payload: {
        phase: 'worker',
        reason: 'retryable_failure',
        currentAttempt,
        maxAttempts,
        message: error && error.message ? String(error.message).slice(0, 1000) : 'Retryable worker failure'
      }
    });
  } catch (streamError) {
    console.warn(`Unable to append run.deferred stream event for ${runId}:`, streamError.message);
  }
}

/**
 * Handles Agent run turn for this module.
 */
async function handleAgentRunTurn(job, token) {
  const { runId } = job.data;
  let runLeaseHeartbeat = null;
  let run = null;
  let concurrencyPolicy = null;
  let llmSelection = null;
  const streamEmitMetrics = {
    count: 0,
    durationMs: 0
  };

  try {
    run = await getRunById(runId);
    logPerformance({
      stage: 'queue_wait',
      runId,
      userId: run.user_id,
      durationMs: Math.max(0, Date.now() - Number(job.timestamp || Date.now()))
    });
    concurrencyPolicy = await resolveConcurrencyPolicy(run.user_id);
/**
 * Handles Emit stream event for agent-run-turn.handler.js.
 */
    const emitStreamEvent = async ({ eventType, payload }) => {
      const startedAt = performance.now();

      try {
        return await publishHotStreamEvent({
          runId,
          eventType,
          payload
        });
      } finally {
        streamEmitMetrics.count += 1;
        streamEmitMetrics.durationMs += performance.now() - startedAt;
      }
    };

    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'canceled') {
      try {
        await releaseActiveRunLease({
          runId,
          userId: run.user_id
        });
      } catch (error) {
        console.warn(`Unable to release active-run lease for terminal run ${runId}:`, error.message);
      }

      return {
        runId,
        status: run.status,
        skipped: true
      };
    }

    try {
      await refreshActiveRunLease({
        runId,
        userId: run.user_id,
        concurrencyPolicy
      });
    } catch (error) {
      console.warn(`Unable to refresh active-run lease before processing ${runId}:`, error.message);
    }

    runLeaseHeartbeat = startHeartbeat(async () => {
      await refreshActiveRunLease({
        runId,
        userId: run.user_id,
        concurrencyPolicy
      });
    }, RUN_LEASE_HEARTBEAT_INTERVAL_MS, 'Active run lease heartbeat');
    llmSelection = resolveEffectiveLlmSelectionForRun(run);

    if (run.status !== 'running') {
      await markRunRunning(runId, {
        providerKey: llmSelection.provider,
        modelKey: llmSelection.model
      });

      await emitStreamEvent({
        eventType: 'run.started',
        payload: {
          phase: 'worker',
          jobId: job.id
        }
      });
    }

    const result = await runAgentTurn(run, {
      llm: llmSelection
    });

    await markRunSucceeded(runId);

    await emitStreamEvent({
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: job.id,
        provider: result.provider,
        model: result.model
      }
    });

    try {
      const refreshedRun = await getRunById(runId).catch(() => run);
      await enqueueFinalRunDelivery({
        run: refreshedRun,
        outputText: result.outputText
      });
    } catch (deliveryError) {
      console.error(`Unable to enqueue final delivery for succeeded run ${runId}:`, deliveryError);
    }

    try {
      await releaseActiveRunLease({
        runId,
        userId: run.user_id
      });
    } catch (error) {
      console.warn(`Unable to release active-run lease for succeeded run ${runId}:`, error.message);
    }

    return {
      runId,
      status: 'succeeded'
    };
  } catch (error) {
    if (error instanceof DelayedError || error.name === 'DelayedError') {
      throw error;
    }

    if (error && error.errorClass === ERROR_CLASSES.rateLimited) {
      const deferred = await deferRateLimitedRun(job, token, runId, error, payload => publishHotStreamEvent(payload));

      if (!deferred) {
        throw error;
      }
    }

    const failure = classifyJobError(error);
    const attemptState = getJobAttemptState(job);
    const isTerminalFailure = failure.failureClass === 'permanent' || attemptState.isFinalAttempt;

    if (!isTerminalFailure) {
      await deferRetryableFailure({
        runId,
        error,
        currentAttempt: attemptState.currentAttempt,
        maxAttempts: attemptState.maxAttempts
      });
      throw annotateErrorForQueue(error, failure.failureClass);
    }

    try {
      await markRunFailed(runId, error);
    } catch (markFailedError) {
      console.error(`Unable to mark run ${runId} as failed:`, markFailedError);
    }

    try {
      const startedAt = performance.now();
      try {
        await publishHotStreamEvent({
          runId,
          eventType: 'run.failed',
          payload: {
            phase: 'worker',
            jobId: job.id,
            errorCode: 'worker_error',
            message: error && error.message ? error.message.slice(0, 1000) : 'Unknown worker error'
          }
        });
      } finally {
        streamEmitMetrics.count += 1;
        streamEmitMetrics.durationMs += performance.now() - startedAt;
      }
    } catch (streamError) {
      console.error(`Unable to append run.failed stream event for ${runId}:`, streamError);
    }

    if (run) {
      try {
        const refreshedRun = await getRunById(runId).catch(() => run);
        await enqueueFinalRunDelivery({
          run: refreshedRun,
          error
        });
      } catch (deliveryError) {
        console.error(`Unable to enqueue final delivery for failed run ${runId}:`, deliveryError);
      }

      try {
        await releaseActiveRunLease({
          runId,
          userId: run.user_id
        });
      } catch (releaseError) {
        console.error(`Unable to release active-run lease for failed run ${runId}:`, releaseError);
      }
    }

    throw annotateErrorForQueue(error, failure.failureClass);
  } finally {
    if (runLeaseHeartbeat) {
      clearInterval(runLeaseHeartbeat);
    }

    if (run) {
      const finishFlush = startTimer({
        stage: 'stream_flush',
        runId,
        userId: run.user_id
      });

      try {
        const flushResult = await flushBufferedRunStreamEvents(runId);
        finishFlush({
          outcome: flushResult.flushed ? 'ok' : 'skipped',
          eventCount: flushResult.eventCount,
          insertedCount: flushResult.insertedCount,
          lastSeqNum: flushResult.lastSeqNum,
          source: flushResult.reason ? 'redis_unavailable' : 'redis'
        });
      } catch (error) {
        finishFlush({
          outcome: 'error',
          errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
        });
        console.warn(`Unable to flush buffered stream events for ${runId}:`, error.message);
      }

      logPerformance({
        stage: 'stream_emit_summary',
        scope: 'worker_handler',
        runId,
        userId: run.user_id,
        eventCount: streamEmitMetrics.count,
        durationMs: Math.round(streamEmitMetrics.durationMs * 1000) / 1000
      });
    }
  }
}

module.exports = {
  handleAgentRunTurn
};
