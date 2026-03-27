const { badRequest, conflict, notFound } = require('../../shared/errors');
const { getRunById } = require('../../runtime/services/run-state.service');
const { getStreamEventBounds, listStreamEvents } = require('../../runtime/services/stream-events.service');
const { resolveConcurrencyPolicy } = require('../../runtime/services/concurrency-policy.service');
const {
  admitActiveStream,
  refreshActiveStreamLease,
  releaseActiveStreamLease
} = require('./concurrency-admission.service');

const POLL_INTERVAL_MS = 120;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_BATCH_SIZE = 200;
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function coerceCursor(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }

  if (!/^\d+$/.test(String(rawValue))) {
    throw badRequest('Invalid SSE resume cursor');
  }

  return Number(rawValue);
}

function resolveCursor(req) {
  const queryCursor = req.query && typeof req.query.since === 'string'
    ? req.query.since
    : undefined;
  const headerCursor = req.header('Last-Event-ID');

  return coerceCursor(queryCursor !== undefined ? queryCursor : headerCursor);
}

function normalizeStreamEvent(row) {
  const payload = row.payload || {};
  const base = {
    runId: row.run_id,
    eventId: row.seq_num,
    seqNum: row.seq_num,
    createdAt: row.created_at
  };

  if (row.event_type === 'run.started') {
    return {
      id: row.seq_num,
      event: 'run.started',
      data: {
        ...base,
        type: 'run.started',
        phase: payload.phase || null
      }
    };
  }

  if (row.event_type === 'llm.text_delta') {
    return {
      id: row.seq_num,
      event: 'assistant.delta',
      data: {
        ...base,
        type: 'assistant.delta',
        iteration: payload.iteration || null,
        text: payload.text || ''
      }
    };
  }

  if (row.event_type === 'llm.message_delta' && payload.stopReason === 'tool_use') {
    return {
      id: row.seq_num,
      event: 'tool.delta',
      data: {
        ...base,
        type: 'tool.delta',
        iteration: payload.iteration || null,
        status: 'detected',
        toolName: null
      }
    };
  }

  if (row.event_type === 'tool.call.requested') {
    return {
      id: row.seq_num,
      event: 'tool.delta',
      data: {
        ...base,
        type: 'tool.delta',
        iteration: payload.iteration || null,
        status: 'requested',
        toolName: payload.toolName || null
      }
    };
  }

  if (row.event_type === 'tool.call.completed') {
    return {
      id: row.seq_num,
      event: 'tool.delta',
      data: {
        ...base,
        type: 'tool.delta',
        iteration: payload.iteration || null,
        status: 'completed',
        toolName: payload.toolName || null,
        resultStatus: payload.resultStatus || null
      }
    };
  }

  if (row.event_type === 'workout.state.updated') {
    return {
      id: row.seq_num,
      event: 'workout.state.updated',
      data: {
        ...base,
        type: 'workout.state.updated',
        iteration: payload.iteration || null,
        toolName: payload.toolName || null,
        appliedStateVersion: payload.appliedStateVersion || null,
        workout: payload.workout || null
      }
    };
  }

  if (row.event_type === 'run.completed') {
    return {
      id: row.seq_num,
      event: 'run.completed',
      data: {
        ...base,
        type: 'run.completed',
        phase: payload.phase || null,
        provider: payload.provider || null,
        model: payload.model || null
      }
    };
  }

  if (row.event_type === 'run.failed') {
    return {
      id: row.seq_num,
      event: 'run.failed',
      data: {
        ...base,
        type: 'run.failed',
        errorCode: payload.errorCode || null,
        message: payload.message || null
      }
    };
  }

  return null;
}

function writeSseEvent(res, event) {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

function writeHeartbeat(res, runId) {
  const payload = {
    runId,
    type: 'heartbeat',
    at: new Date().toISOString()
  };

  res.write(`event: heartbeat\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function loadOwnedRun(runId, userId) {
  const run = await getRunById(runId).catch(error => {
    if (error && error.code === 'PGRST116') {
      return null;
    }

    throw error;
  });

  if (!run || run.user_id !== userId) {
    throw notFound('Run not found');
  }

  return run;
}

async function streamRunEvents({ auth, req, res, params }) {
  const runId = params.runId;
  const cursor = resolveCursor(req);
  const initialRun = await loadOwnedRun(runId, auth.userId);
  const bounds = await getStreamEventBounds(runId);

  if (bounds.firstSeqNum !== null && cursor < bounds.firstSeqNum - 1) {
    throw conflict('Replay window expired', {
      errorCode: 'replay_window_expired'
    });
  }

  const concurrencyPolicy = await resolveConcurrencyPolicy(auth.userId);
  const activeStreamLease = await admitActiveStream({
    userId: auth.userId,
    headers: req.headers,
    concurrencyPolicy
  });

  try {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    let closed = false;
    let lastSeenSeqNum = cursor;
    let lastHeartbeatAt = Date.now();
    let terminalEventSent = false;
    let runStatus = initialRun.status;

    req.on('close', () => {
      closed = true;
    });

    while (!closed) {
      const rows = await listStreamEvents({
        runId,
        afterSeqNum: lastSeenSeqNum,
        limit: MAX_BATCH_SIZE
      });

      for (const row of rows) {
        lastSeenSeqNum = row.seq_num;

        const event = normalizeStreamEvent(row);
        if (!event) {
          continue;
        }

        writeSseEvent(res, event);

        if (event.event === 'run.completed' || event.event === 'run.failed') {
          terminalEventSent = true;
        }
      }

      if (closed) {
        break;
      }

      const currentRun = await loadOwnedRun(runId, auth.userId);
      runStatus = currentRun.status;

      if (!terminalEventSent && runStatus === 'failed') {
        writeSseEvent(res, {
          id: lastSeenSeqNum || 0,
          event: 'run.failed',
          data: {
            runId,
            eventId: lastSeenSeqNum || 0,
            seqNum: lastSeenSeqNum || 0,
            createdAt: new Date().toISOString(),
            type: 'run.failed',
            errorCode: currentRun.error_code || 'worker_error',
            message: currentRun.error_message || 'Run failed'
          }
        });
        terminalEventSent = true;
      }

      if (!terminalEventSent && runStatus === 'succeeded') {
        writeSseEvent(res, {
          id: lastSeenSeqNum || 0,
          event: 'run.completed',
          data: {
            runId,
            eventId: lastSeenSeqNum || 0,
            seqNum: lastSeenSeqNum || 0,
            createdAt: new Date().toISOString(),
            type: 'run.completed',
            phase: 'worker',
            provider: currentRun.provider_key || null,
            model: currentRun.model_key || null
          }
        });
        terminalEventSent = true;
      }

      if (TERMINAL_RUN_STATUSES.has(runStatus) && terminalEventSent) {
        break;
      }

      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        writeHeartbeat(res, runId);
        lastHeartbeatAt = Date.now();

        try {
          const refreshed = await refreshActiveStreamLease({
            lease: activeStreamLease,
            concurrencyPolicy
          });

          if (refreshed.enforced && !refreshed.refreshed) {
            break;
          }
        } catch (error) {
          console.warn('Unable to refresh active-stream lease:', error.message);
        }
      }

      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    try {
      await releaseActiveStreamLease(activeStreamLease);
    } catch (error) {
      console.warn('Unable to release active-stream lease:', error.message);
    }

    res.end();
  }
}

module.exports = {
  streamRunEvents
};
