const { DelayedError } = require('bullmq');

const { env } = require('../../config/env');
const { appendStreamEvent } = require('../../runtime/services/stream-events.service');
const { runAgentTurn } = require('../../runtime/agent-runtime/run-agent-turn');
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
const {
  getRunById,
  markRunFailed,
  markRunRunning,
  markRunSucceeded
} = require('../../runtime/services/run-state.service');

const RUN_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;
const SESSION_LOCK_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const SESSION_LOCK_RETRY_DELAY_MS = 1000;

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

async function acquireSessionMutationLockOrDelay(job, token, run) {
  const lock = await acquireSessionMutationLock({
    userId: run.user_id,
    sessionKey: run.session_key,
    sessionId: run.session_id
  });

  if (lock.acquired) {
    return lock;
  }

  if (token && typeof job.moveToDelayed === 'function') {
    await job.moveToDelayed(Date.now() + SESSION_LOCK_RETRY_DELAY_MS, token);
    throw new DelayedError();
  }

  throw new SessionMutationLockBusyError('Unable to defer run while session mutation lock is busy');
}

async function handleAgentRunTurn(job, token) {
  const { runId } = job.data;
  let lock = null;
  let runLeaseHeartbeat = null;
  let sessionLockHeartbeat = null;
  let run = null;
  let concurrencyPolicy = null;

  try {
    run = await getRunById(runId);
    concurrencyPolicy = await resolveConcurrencyPolicy(run.user_id);

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

    await markRunRunning(runId, {
      providerKey: env.defaultLlmProvider,
      modelKey: env.defaultAnthropicModel
    });

    await appendStreamEvent({
      runId,
      eventType: 'run.started',
      payload: {
        phase: 'worker',
        jobId: job.id
      }
    });

    const result = await runAgentTurn(run);

    await appendStreamEvent({
      runId,
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

    try {
      await appendStreamEvent({
        runId,
        eventType: 'run.failed',
        payload: {
          phase: 'worker',
          jobId: job.id,
          errorCode: 'worker_error',
          message: error && error.message ? error.message.slice(0, 1000) : 'Unknown worker error'
        }
      });
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
  }
}

module.exports = {
  handleAgentRunTurn
};
