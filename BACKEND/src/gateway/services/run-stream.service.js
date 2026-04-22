/**
 * File overview:
 * Implements the run stream service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - sleep: Handles Sleep for run-stream.service.js.
 * - coerceCursor: Coerces Cursor into the expected type.
 * - resolveCursor: Resolves Cursor before the next step runs.
 * - normalizeStreamEvent: Normalizes Stream event into the format this file expects.
 * - writeSseEvent: Writes SSE event to its destination.
 * - writeHeartbeat: Writes Heartbeat to its destination.
 * - buildTerminalEventFromRun: Builds a Terminal event from run used by this file.
 * - emitRowsToSse: Handles Emit rows to SSE for run-stream.service.js.
 * - loadOwnedRun: Loads Owned run for the surrounding workflow.
 * - streamRunEvents: Streams Run events to the caller.
 */

const { badRequest, conflict, notFound } = require('../../shared/errors');
const { getRunById } = require('../../runtime/services/run-state.service');
const { getStreamEventBounds, listStreamEvents } = require('../../runtime/services/stream-events.service');
const {
  getRunStreamWindow,
  listHotRunStreamEvents,
  waitForHotRunStreamEvents
} = require('../../runtime/services/run-stream-redis.service');
const { resolveConcurrencyPolicy } = require('../../runtime/services/concurrency-policy.service');
const { logPerformance, startTimer } = require('../../runtime/services/performance-log.service');
const {
  admitActiveStream,
  refreshActiveStreamLease,
  releaseActiveStreamLease
} = require('./concurrency-admission.service');

const POLL_INTERVAL_MS = 120;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_BATCH_SIZE = 200;
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const STREAM_EVENT_FIELD_ALLOWLIST = {
  'run.started': ['phase'],
  'assistant.delta': ['iteration', 'toolName', 'toolUseId', 'text', 'delivery', 'terminal'],
  'tool.call.requested': ['iteration', 'toolName', 'toolUseId', 'text', 'delivery', 'terminal'],
  'tool.call.completed': ['iteration', 'toolName', 'toolUseId', 'resultStatus', 'text', 'delivery', 'terminal', 'skipped', 'skipReason'],
  'workout.state.updated': ['iteration', 'toolName', 'appliedStateVersion', 'workout', 'command'],
  'run.completed': ['phase', 'provider', 'model'],
  'run.failed': ['errorCode', 'message']
};

/**
 * Handles Sleep for run-stream.service.js.
 */
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * Coerces Cursor into the expected type.
 */
function coerceCursor(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }

  if (!/^\d+$/.test(String(rawValue))) {
    throw badRequest('Invalid SSE resume cursor');
  }

  return Number(rawValue);
}

/**
 * Resolves Cursor before the next step runs.
 */
function resolveCursor(req) {
  const queryCursor = req.query && typeof req.query.since === 'string'
    ? req.query.since
    : undefined;
  const headerCursor = req.header('Last-Event-ID');

  return coerceCursor(queryCursor !== undefined ? queryCursor : headerCursor);
}

/**
 * Normalizes Stream event into the format this file expects.
 */
function normalizeStreamEvent(row) {
  const allowedFields = STREAM_EVENT_FIELD_ALLOWLIST[row.event_type];

  if (!allowedFields) {
    return null;
  }

  const payload = row.payload || {};
  const data = {
    runId: row.run_id,
    eventId: row.seq_num,
    seqNum: row.seq_num,
    createdAt: row.created_at,
    type: row.event_type
  };

  for (const field of allowedFields) {
    if (field === 'terminal') {
      data.terminal = payload.terminal === true;
      continue;
    }

    data[field] = payload[field] ?? null;
  }

  return {
    id: row.seq_num,
    event: row.event_type,
    data
  };
}

/**
 * Writes SSE event to its destination.
 */
function writeSseEvent(res, event) {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Writes Heartbeat to its destination.
 */
function writeHeartbeat(res, runId) {
  const payload = {
    runId,
    type: 'heartbeat',
    at: new Date().toISOString()
  };

  res.write(`event: heartbeat\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Builds a Terminal event from run used by this file.
 */
function buildTerminalEventFromRun({ runId, lastSeenSeqNum, run }) {
  const seqNum = lastSeenSeqNum || 0;
  const createdAt = new Date().toISOString();

  if (run.status === 'failed') {
    return {
      id: seqNum,
      event: 'run.failed',
      data: {
        runId,
        eventId: seqNum,
        seqNum,
        createdAt,
        type: 'run.failed',
        errorCode: run.error_code || 'worker_error',
        message: run.error_message || 'Run failed'
      }
    };
  }

  if (run.status === 'succeeded') {
    return {
      id: seqNum,
      event: 'run.completed',
      data: {
        runId,
        eventId: seqNum,
        seqNum,
        createdAt,
        type: 'run.completed',
        phase: 'worker',
        provider: run.provider_key || null,
        model: run.model_key || null
      }
    };
  }

  return null;
}

/**
 * Handles Emit rows to SSE for run-stream.service.js.
 */
function emitRowsToSse({ res, rows, lastSeenSeqNum, terminalEventSent }) {
  let nextLastSeenSeqNum = lastSeenSeqNum;
  let nextTerminalEventSent = terminalEventSent;
  let emittedCount = 0;

  for (const row of rows) {
    nextLastSeenSeqNum = row.seq_num;

    const event = normalizeStreamEvent(row);
    if (!event) {
      continue;
    }

    writeSseEvent(res, event);
    emittedCount += 1;

    if (event.event === 'run.completed' || event.event === 'run.failed') {
      nextTerminalEventSent = true;
    }
  }

  return {
    emittedCount,
    lastSeenSeqNum: nextLastSeenSeqNum,
    terminalEventSent: nextTerminalEventSent
  };
}

/**
 * Loads Owned run for the surrounding workflow.
 */
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

/**
 * Streams Run events to the caller.
 */
async function streamRunEvents({ auth, req, res, params }) {
  const runId = params.runId;
  const cursor = resolveCursor(req);
  const requestId = req.requestId || null;
  const setupTimer = startTimer({
    requestId,
    route: '/v1/runs/:runId/stream',
    stage: 'run_stream_setup',
    runId,
    userId: auth.userId
  });
  const [initialRun, bounds, initialHotWindow] = await Promise.all([
    loadOwnedRun(runId, auth.userId),
    getStreamEventBounds(runId),
    getRunStreamWindow(runId).catch(error => ({
      available: false,
      reason: error && error.message ? error.message.slice(0, 200) : 'redis_window_error'
    }))
  ]);

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
  setupTimer({
    outcome: 'ok',
    cursor,
    redisAvailable: initialHotWindow.available === true,
    hotFirstSeqNum: initialHotWindow.firstSeqNum ?? null,
    hotLastSeqNum: initialHotWindow.lastSeqNum ?? null
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
    let hotWindow = initialHotWindow;
    let lastRedisId = hotWindow && hotWindow.available
      ? (hotWindow.lastRedisId || '$')
      : '$';

    req.on('close', () => {
      closed = true;
    });

    while (!closed) {
      let rows = [];
      let source = hotWindow && hotWindow.available ? 'redis' : 'postgres';
      let fallbackReason = null;

      if (source === 'redis') {
        if (
          hotWindow
          && hotWindow.empty !== true
          && hotWindow.firstSeqNum !== null
          && lastSeenSeqNum < hotWindow.firstSeqNum - 1
        ) {
          source = 'postgres';
          fallbackReason = 'cursor_before_redis_hot_window';
        } else {
          const hotResult = await listHotRunStreamEvents({
            runId,
            afterSeqNum: lastSeenSeqNum,
            limit: MAX_BATCH_SIZE
          });

          if (!hotResult.available) {
            source = 'postgres';
            fallbackReason = hotResult.reason || 'redis_unavailable';
          } else {
            rows = hotResult.rows;
            lastRedisId = hotResult.lastRedisId || lastRedisId;

            if (rows.length === 0) {
              const waitTimer = startTimer({
                requestId,
                route: '/v1/runs/:runId/stream',
                stage: 'run_stream_wait',
                runId,
                userId: auth.userId
              });
              const waitResult = await waitForHotRunStreamEvents({
                runId,
                lastRedisId,
                limit: MAX_BATCH_SIZE,
                blockMs: HEARTBEAT_INTERVAL_MS
              });
              waitTimer({
                outcome: 'ok',
                source: 'redis',
                timedOut: waitResult.timedOut === true,
                batchSize: waitResult.rows.length
              });

              if (!waitResult.available) {
                source = 'postgres';
                fallbackReason = waitResult.reason || 'redis_wait_unavailable';
              } else {
                rows = waitResult.rows;
                lastRedisId = waitResult.lastRedisId || lastRedisId;
              }
            }

            if (rows.length === 0) {
              hotWindow = await getRunStreamWindow(runId).catch(error => ({
                available: false,
                reason: error && error.message ? error.message.slice(0, 200) : 'redis_window_error'
              }));

              if (!hotWindow.available) {
                source = 'postgres';
                fallbackReason = hotWindow.reason || 'redis_window_unavailable';
              } else if (
                hotWindow.empty !== true
                && hotWindow.lastSeqNum !== null
                && hotWindow.lastSeqNum > lastSeenSeqNum
              ) {
                source = 'postgres';
                fallbackReason = 'redis_gap_detected';
              } else {
                lastRedisId = hotWindow.lastRedisId || lastRedisId || '$';
              }
            }
          }
        }
      }

      if (source === 'postgres') {
        rows = await listStreamEvents({
          runId,
          afterSeqNum: lastSeenSeqNum,
          limit: MAX_BATCH_SIZE
        });

        if (rows.length === 0) {
          hotWindow = await getRunStreamWindow(runId).catch(error => ({
            available: false,
            reason: error && error.message ? error.message.slice(0, 200) : 'redis_window_error'
          }));

          if (hotWindow.available) {
            lastRedisId = hotWindow.lastRedisId || lastRedisId || '$';
          }
        }
      }

      const emission = emitRowsToSse({
        res,
        rows,
        lastSeenSeqNum,
        terminalEventSent
      });
      lastSeenSeqNum = emission.lastSeenSeqNum;
      terminalEventSent = emission.terminalEventSent;

      if (rows.some(row => row.event_type === 'run.completed')) {
        runStatus = 'succeeded';
      } else if (rows.some(row => row.event_type === 'run.failed')) {
        runStatus = 'failed';
      }

      if (rows.length > 0) {
        logPerformance({
          requestId,
          route: '/v1/runs/:runId/stream',
          stage: 'run_stream_batch',
          runId,
          userId: auth.userId,
          source,
          fallbackReason,
          batchSize: emission.emittedCount
        });
      }

      if (closed) {
        break;
      }

      if (!terminalEventSent && rows.length === 0) {
        const currentRun = await loadOwnedRun(runId, auth.userId);
        runStatus = currentRun.status;
        const terminalEvent = buildTerminalEventFromRun({
          runId,
          lastSeenSeqNum,
          run: currentRun
        });

        if (terminalEvent) {
          writeSseEvent(res, terminalEvent);
          terminalEventSent = true;
          logPerformance({
            requestId,
            route: '/v1/runs/:runId/stream',
            stage: 'run_stream_batch',
            runId,
            userId: auth.userId,
            source: 'runs_table',
            batchSize: 1
          });
        }
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

      if (source === 'postgres' && rows.length === 0) {
        await sleep(POLL_INTERVAL_MS);
      }
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
  normalizeStreamEvent,
  streamRunEvents
};
