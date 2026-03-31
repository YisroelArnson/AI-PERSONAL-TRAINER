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
const {
  SessionMutationLockBusyError,
  acquireSessionMutationLock,
  renewSessionMutationLock,
  releaseSessionMutationLock
} = require('../../runtime/services/session-mutation-lock.service');
const { ERROR_CLASSES } = require('../../runtime/agent-runtime/types');
const {
  getRunById,
  markRunFailed,
  markRunRunning,
  markRunSucceeded
} = require('../../runtime/services/run-state.service');

const RUN_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;
const SESSION_LOCK_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const SESSION_LOCK_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_RETRY_FALLBACK_MS = 60 * 1000;
const RATE_LIMIT_RETRY_BUFFER_MS = 1000;

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

function normalizeDelayMs(delayMs, fallbackMs) {
  const normalizedFallbackMs = Math.max(1000, Math.floor(Number(fallbackMs) || 1000));
  const normalizedDelayMs = Number(delayMs);

  if (!Number.isFinite(normalizedDelayMs) || normalizedDelayMs < 0) {
    return normalizedFallbackMs;
  }

  return Math.max(1000, Math.floor(normalizedDelayMs));
}

async function moveJobToDelayedOrThrow(job, token, delayMs, fallbackMs) {
  if (token && typeof job.moveToDelayed === 'function') {
    await job.moveToDelayed(
      Date.now() + normalizeDelayMs(delayMs, fallbackMs),
      token
    );
    throw new DelayedError();
  }
}

async function acquireSessionMutationLockOrDelay(job, token, run) {
  const lock = await acquireSessionMutationLock({
    userId: run.user_id,
    sessionKey: run.session_key,
    sessionId: run.session_id
  });

  if (lock.acquired) {
    return lock;
  }

  await moveJobToDelayedOrThrow(job, token, SESSION_LOCK_RETRY_DELAY_MS, SESSION_LOCK_RETRY_DELAY_MS);

  throw new SessionMutationLockBusyError('Unable to defer run while session mutation lock is busy');
}

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

async function handleAgentRunTurn(job, token) {
  const { runId } = job.data;
  let lock = null;
  let runLeaseHeartbeat = null;
  let sessionLockHeartbeat = null;
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

    lock = await acquireSessionMutationLockOrDelay(job, token, run);
    sessionLockHeartbeat = startHeartbeat(async () => {
      const renewed = await renewSessionMutationLock(lock);

      if (!renewed) {
        throw new Error('SESSION_MUTATION_LOCK_LOST');
      }
    }, SESSION_LOCK_HEARTBEAT_INTERVAL_MS, 'Session mutation lock heartbeat');
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

    await emitStreamEvent({
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: job.id,
        provider: result.provider,
        model: result.model
      }
    });

    await markRunSucceeded(runId);
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

    if (error instanceof SessionMutationLockBusyError) {
      throw error;
    }

    if (error && error.errorClass === ERROR_CLASSES.rateLimited) {
      const deferred = await deferRateLimitedRun(job, token, runId, error, payload => publishHotStreamEvent(payload));

      if (!deferred) {
        throw error;
      }
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

    try {
      await markRunFailed(runId, error);
    } catch (markFailedError) {
      console.error(`Unable to mark run ${runId} as failed:`, markFailedError);
    }

    if (run) {
      try {
        await releaseActiveRunLease({
          runId,
          userId: run.user_id
        });
      } catch (releaseError) {
        console.error(`Unable to release active-run lease for failed run ${runId}:`, releaseError);
      }
    }

    throw error;
  } finally {
    if (runLeaseHeartbeat) {
      clearInterval(runLeaseHeartbeat);
    }

    if (sessionLockHeartbeat) {
      clearInterval(sessionLockHeartbeat);
    }

    if (lock) {
      try {
        await releaseSessionMutationLock(lock);
      } catch (error) {
        console.warn(`Unable to release session mutation lock for ${runId}:`, error.message);
      }
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
