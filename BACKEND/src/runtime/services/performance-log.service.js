/**
 * File overview:
 * Implements runtime service logic for performance log.
 *
 * Main functions in this file:
 * - isLoggingEnabled: Handles Is logging enabled for performance-log.service.js.
 * - shouldSample: Handles Should sample for performance-log.service.js.
 * - shouldUsePrettyLogs: Handles Should use pretty logs for performance-log.service.js.
 * - roundDuration: Handles Round duration for performance-log.service.js.
 * - trimTrailingZeros: Trims Trailing zeros to the supported shape.
 * - formatDuration: Formats Duration for display or logging.
 * - shortenValue: Handles Shorten value for performance-log.service.js.
 * - formatYesNo: Formats Yes no for display or logging.
 * - formatOutcome: Formats Outcome for display or logging.
 * - getOrCreateRunMetrics: Gets Or create run metrics needed by this file.
 * - getOrCreateIterationMetrics: Gets Or create iteration metrics needed by this file.
 * - updateRunMetrics: Updates Run metrics with the latest state.
 * - buildRunSummaryLines: Builds a Run summary lines used by this file.
 * - formatGenericLine: Formats Generic line for display or logging.
 * - printPrettyRecord: Handles Print pretty record for performance-log.service.js.
 * - logPerformance: Handles Log performance for performance-log.service.js.
 * - startTimer: Starts Timer for this module.
 * - measureAsync: Handles Measure async for performance-log.service.js.
 */

const { performance } = require('node:perf_hooks');

const { env } = require('../../config/env');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const runMetricsByRunId = new Map();

/**
 * Handles Is logging enabled for performance-log.service.js.
 */
function isLoggingEnabled() {
  if (typeof env.performanceLoggingEnabled === 'boolean') {
    return env.performanceLoggingEnabled;
  }

  return process.env.NODE_ENV !== 'test';
}

/**
 * Handles Should sample for performance-log.service.js.
 */
function shouldSample() {
  const sampleRate = Number.isFinite(Number(env.performanceLogSampleRate))
    ? Math.max(0, Math.min(1, Number(env.performanceLogSampleRate)))
    : 1;

  if (sampleRate >= 1) {
    return true;
  }

  return Math.random() <= sampleRate;
}

/**
 * Handles Should use pretty logs for performance-log.service.js.
 */
function shouldUsePrettyLogs() {
  return String(env.performanceLogFormat || 'pretty').trim().toLowerCase() !== 'json';
}

/**
 * Handles Round duration for performance-log.service.js.
 */
function roundDuration(durationMs) {
  return Math.round(Number(durationMs) * 1000) / 1000;
}

/**
 * Trims Trailing zeros to the supported shape.
 */
function trimTrailingZeros(value) {
  return String(value)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
}

/**
 * Formats Duration for display or logging.
 */
function formatDuration(value) {
  const durationMs = Number(value);

  if (!Number.isFinite(durationMs)) {
    return '?';
  }

  if (durationMs >= 1000) {
    return `${trimTrailingZeros((durationMs / 1000).toFixed(durationMs >= 10000 ? 1 : 2))}s`;
  }

  if (durationMs >= 10) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${trimTrailingZeros(durationMs.toFixed(3))}ms`;
}

/**
 * Handles Shorten value for performance-log.service.js.
 */
function shortenValue(value, maxLength = 48) {
  const stringValue = String(value || '');

  if (!stringValue) {
    return '-';
  }

  if (UUID_PATTERN.test(stringValue)) {
    return `${stringValue.slice(0, 8)}…`;
  }

  if (stringValue.length <= maxLength) {
    return stringValue;
  }

  return `${stringValue.slice(0, maxLength - 1)}…`;
}

/**
 * Formats Yes no for display or logging.
 */
function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

/**
 * Formats Outcome for display or logging.
 */
function formatOutcome(value) {
  return value || 'ok';
}

/**
 * Gets Or create run metrics needed by this file.
 */
function getOrCreateRunMetrics(record) {
  const runId = String(record.runId || '').trim();

  if (!runId) {
    return null;
  }

  let metrics = runMetricsByRunId.get(runId);

  if (!metrics) {
    metrics = {
      runId,
      userId: record.userId || null,
      queueWaitMs: null,
      promptAssemblyMs: null,
      promptCacheHit: null,
      hasCurrentWorkout: null,
      iterations: new Map(),
      assistantTranscriptWriteMs: null,
      runtimeStreamEmit: null,
      workerStreamEmit: null
    };
    runMetricsByRunId.set(runId, metrics);
  }

  if (!metrics.userId && record.userId) {
    metrics.userId = record.userId;
  }

  return metrics;
}

/**
 * Gets Or create iteration metrics needed by this file.
 */
function getOrCreateIterationMetrics(metrics, iteration) {
  const iterationKey = Number(iteration);

  if (!metrics.iterations.has(iterationKey)) {
    metrics.iterations.set(iterationKey, {
      iteration: iterationKey,
      provider: null,
      model: null,
      providerRequestBuildMs: null,
      providerTtfbMs: null,
      providerTtfbEventType: null,
      providerTotalMs: null,
      stopReason: null,
      toolCallCount: null,
      tools: []
    });
  }

  return metrics.iterations.get(iterationKey);
}

/**
 * Updates Run metrics with the latest state.
 */
function updateRunMetrics(record) {
  const metrics = getOrCreateRunMetrics(record);

  if (!metrics) {
    return null;
  }

  switch (record.stage) {
    case 'queue_wait':
      metrics.queueWaitMs = record.durationMs;
      break;
    case 'prompt_assembly':
      metrics.promptAssemblyMs = record.durationMs;
      metrics.promptCacheHit = record.cacheHit;
      metrics.hasCurrentWorkout = record.hasCurrentWorkout;
      break;
    case 'provider_request_build': {
      const iteration = getOrCreateIterationMetrics(metrics, record.iteration);
      iteration.provider = record.provider || iteration.provider;
      iteration.model = record.model || iteration.model;
      iteration.providerRequestBuildMs = record.durationMs;
      break;
    }
    case 'provider_ttfb': {
      const iteration = getOrCreateIterationMetrics(metrics, record.iteration);
      iteration.provider = record.provider || iteration.provider;
      iteration.model = record.model || iteration.model;
      iteration.providerTtfbMs = record.durationMs;
      iteration.providerTtfbEventType = record.eventType || null;
      break;
    }
    case 'provider_total': {
      const iteration = getOrCreateIterationMetrics(metrics, record.iteration);
      iteration.provider = record.provider || iteration.provider;
      iteration.model = record.model || iteration.model;
      iteration.providerTotalMs = record.durationMs;
      iteration.stopReason = record.stopReason || null;
      iteration.toolCallCount = record.toolCallCount;
      break;
    }
    case 'tool_call': {
      const iteration = getOrCreateIterationMetrics(metrics, record.iteration);
      iteration.tools.push({
        toolName: record.toolName || 'unknown_tool',
        toolQuery: record.toolQuery || null,
        durationMs: record.durationMs,
        outcome: record.outcome || 'ok',
        resultStatus: record.resultStatus || null
      });
      break;
    }
    case 'assistant_transcript_write':
      metrics.assistantTranscriptWriteMs = record.durationMs;
      break;
    case 'stream_emit_summary':
      if (record.scope === 'worker_handler') {
        metrics.workerStreamEmit = {
          eventCount: record.eventCount,
          durationMs: record.durationMs
        };
      } else {
        metrics.runtimeStreamEmit = {
          eventCount: record.eventCount,
          durationMs: record.durationMs
        };
      }
      break;
    default:
      break;
  }

  return metrics;
}

/**
 * Builds a Run summary lines used by this file.
 */
function buildRunSummaryLines(record) {
  const metrics = updateRunMetrics(record);

  if (!metrics || record.stage !== 'stream_emit_summary' || record.scope !== 'worker_handler') {
    return null;
  }

  const lines = [
    '',
    `=== RUN ${shortenValue(metrics.runId)} SUMMARY ===`,
    `user               ${shortenValue(metrics.userId)}`
  ];

  if (metrics.queueWaitMs != null) {
    lines.push(`queue wait         ${formatDuration(metrics.queueWaitMs)}`);
  }

  if (metrics.promptAssemblyMs != null) {
    lines.push(
      `prompt assembly    ${formatDuration(metrics.promptAssemblyMs)}`
      + ` | cacheHit=${formatYesNo(metrics.promptCacheHit)}`
      + ` | workout=${formatYesNo(metrics.hasCurrentWorkout)}`
    );
  }

  const sortedIterations = [...metrics.iterations.values()].sort((left, right) => left.iteration - right.iteration);

  for (const iteration of sortedIterations) {
    let line = `iter ${iteration.iteration}`;
    line = line.padEnd(19, ' ');

    if (iteration.providerTtfbMs != null) {
      line += `ttfb=${formatDuration(iteration.providerTtfbMs)}`;
    }

    if (iteration.providerTotalMs != null) {
      line += ` | total=${formatDuration(iteration.providerTotalMs)}`;
    }

    if (iteration.stopReason) {
      line += ` | stop=${iteration.stopReason}`;
    }

    if (Number.isInteger(iteration.toolCallCount)) {
      line += ` | tools=${iteration.toolCallCount}`;
    }

    lines.push(line);

    for (const tool of iteration.tools) {
      lines.push(
        `  tool              ${tool.toolName}`
        + ` | ${formatDuration(tool.durationMs)}`
        + ` | outcome=${formatOutcome(tool.outcome)}`
        + (tool.resultStatus ? ` | status=${tool.resultStatus}` : '')
        + (tool.toolQuery ? ` | query=${JSON.stringify(shortenValue(tool.toolQuery, 96))}` : '')
      );
    }
  }

  if (metrics.assistantTranscriptWriteMs != null) {
    lines.push(`transcript write   ${formatDuration(metrics.assistantTranscriptWriteMs)}`);
  }

  if (metrics.runtimeStreamEmit || metrics.workerStreamEmit) {
    const runtimePart = metrics.runtimeStreamEmit
      ? `runtime ${metrics.runtimeStreamEmit.eventCount} events / ${formatDuration(metrics.runtimeStreamEmit.durationMs)}`
      : 'runtime -';
    const workerPart = metrics.workerStreamEmit
      ? `handler ${metrics.workerStreamEmit.eventCount} events / ${formatDuration(metrics.workerStreamEmit.durationMs)}`
      : 'handler -';
    lines.push(`stream emit        ${runtimePart} | ${workerPart}`);
  }

  lines.push('============================');
  runMetricsByRunId.delete(metrics.runId);
  return lines;
}

/**
 * Formats Generic line for display or logging.
 */
function formatGenericLine(record) {
  const baseLabel = record.runId
    ? `[run ${shortenValue(record.runId)}]`
    : record.requestId
      ? `[req ${shortenValue(record.requestId)}]`
      : '[perf]';

  switch (record.stage) {
    case 'queue_wait':
      return `${baseLabel} queue wait ${formatDuration(record.durationMs)}`;
    case 'prompt_assembly':
      return `${baseLabel} prompt ${formatDuration(record.durationMs)}`
        + ` | cacheHit=${formatYesNo(record.cacheHit)}`
        + ` | workout=${formatYesNo(record.hasCurrentWorkout)}`;
    case 'provider_request_build':
      if (record.outcome === 'ok' && Number(record.durationMs) < 5) {
        return null;
      }
      return `${baseLabel} iter ${record.iteration} request build ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`;
    case 'provider_ttfb':
      return `${baseLabel} iter ${record.iteration} first token ${formatDuration(record.durationMs)}`
        + ` | event=${record.eventType || '-'}`;
    case 'provider_total':
      return `${baseLabel} iter ${record.iteration} model ${formatDuration(record.durationMs)}`
        + ` | stop=${record.stopReason || '-'}`
        + ` | tools=${Number.isInteger(record.toolCallCount) ? record.toolCallCount : '-'}`;
    case 'tool_call':
      return `${baseLabel} iter ${record.iteration} tool ${record.toolName || 'unknown_tool'} ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + (record.resultStatus ? ` | status=${record.resultStatus}` : '')
        + (record.toolQuery ? ` | query=${JSON.stringify(shortenValue(record.toolQuery, 96))}` : '');
    case 'assistant_transcript_write':
      return `${baseLabel} transcript write ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`;
    case 'auth':
      return `${baseLabel} auth ${record.route || ''} ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + (record.source ? ` | source=${record.source}` : '');
    case 'policy_resolution':
      return `${baseLabel} policy resolution ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + ` | replayed=${formatYesNo(record.replayed)}`;
    case 'message_ingest_rpc':
      return `${baseLabel} ingest ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + ` | rotated=${formatYesNo(record.rotated)}`;
    case 'queue_enqueue':
      return `${baseLabel} queue enqueue ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + ` | replayed=${formatYesNo(record.replayed)}`
        + ` | enqueued=${formatYesNo(record.enqueued)}`;
    case 'coach_surface_build':
      return `${baseLabel} coach surface ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + ` | activeRun=${formatYesNo(record.hasActiveRun)}`
        + ` | workout=${formatYesNo(record.hasWorkout)}`
        + (Number.isInteger(record.feedCount) ? ` | feed=${record.feedCount}` : '');
    case 'run_stream_setup':
      return `${baseLabel} stream setup ${formatDuration(record.durationMs)}`
        + ` | redis=${formatYesNo(record.redisAvailable)}`
        + (record.hotLastSeqNum != null ? ` | hotLastSeq=${record.hotLastSeqNum}` : '');
    case 'run_stream_wait':
      if (record.timedOut === true) {
        return null;
      }
      return `${baseLabel} stream wake ${formatDuration(record.durationMs)}`
        + ` | source=${record.source || '-'}`
        + ` | batch=${record.batchSize || 0}`;
    case 'run_stream_batch':
      if (record.source === 'redis' && !record.fallbackReason) {
        return null;
      }
      return `${baseLabel} stream batch ${record.batchSize || 0} events`
        + ` | source=${record.source || '-'}`
        + (record.fallbackReason ? ` | fallback=${record.fallbackReason}` : '');
    case 'stream_flush':
      return `${baseLabel} stream flush ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`
        + (Number.isInteger(record.eventCount) ? ` | events=${record.eventCount}` : '')
        + (Number.isInteger(record.insertedCount) ? ` | inserted=${record.insertedCount}` : '')
        + (record.lastSeqNum != null ? ` | lastSeq=${record.lastSeqNum}` : '')
        + (record.source ? ` | source=${record.source}` : '');
    case 'stream_emit_summary':
      return null;
    default:
      return `${baseLabel} ${record.stage || 'unknown'} ${formatDuration(record.durationMs)}`
        + ` | outcome=${formatOutcome(record.outcome)}`;
  }
}

/**
 * Handles Print pretty record for performance-log.service.js.
 */
function printPrettyRecord(record) {
  const summaryLines = buildRunSummaryLines(record);

  if (Array.isArray(summaryLines) && summaryLines.length > 0) {
    console.log(summaryLines.join('\n'));
    return;
  }

  const line = formatGenericLine(record);

  if (line) {
    console.log(line);
  }
}

/**
 * Handles Log performance for performance-log.service.js.
 */
function logPerformance(payload) {
  if (!isLoggingEnabled() || !shouldSample()) {
    return;
  }

  const record = {
    type: 'performance',
    at: new Date().toISOString(),
    ...payload
  };

  if (shouldUsePrettyLogs()) {
    printPrettyRecord(record);
    return;
  }

  console.log(JSON.stringify(record));
}

/**
 * Starts Timer for this module.
 */
function startTimer(basePayload = {}) {
  const startedAt = performance.now();

  return function finish(extraPayload = {}) {
    logPerformance({
      ...basePayload,
      ...extraPayload,
      durationMs: roundDuration(performance.now() - startedAt)
    });
  };
}

/**
 * Handles Measure async for performance-log.service.js.
 */
async function measureAsync(basePayload, fn, extraPayloadFactory) {
  const finish = startTimer(basePayload);

  try {
    const result = await fn();
    finish({
      outcome: 'ok',
      ...(typeof extraPayloadFactory === 'function'
        ? extraPayloadFactory(null, result) || {}
        : {})
    });
    return result;
  } catch (error) {
    finish({
      outcome: 'error',
      errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error',
      ...(typeof extraPayloadFactory === 'function'
        ? extraPayloadFactory(error) || {}
        : {})
    });
    throw error;
  }
}

module.exports = {
  logPerformance,
  measureAsync,
  startTimer
};
