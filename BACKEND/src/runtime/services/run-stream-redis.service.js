const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');

const TERMINAL_STREAM_EVENT_TYPES = new Set(['run.completed', 'run.failed']);

function buildRunStreamKey(runId) {
  return `run-stream:${runId}:events`;
}

function buildRunStreamMetaKey(runId) {
  return `run-stream:${runId}:meta`;
}

function buildRunStreamSeqKey(runId) {
  return `run-stream:${runId}:seq`;
}

function pairsToObject(pairs) {
  const object = {};

  for (let index = 0; index < pairs.length; index += 2) {
    object[pairs[index]] = pairs[index + 1];
  }

  return object;
}

function parseRedisStreamEntry(runId, entry) {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const [redisId, rawPairs] = entry;
  const fields = Array.isArray(rawPairs) ? pairsToObject(rawPairs) : {};

  return {
    redisId,
    row: {
      id: fields.id || null,
      run_id: runId,
      seq_num: Number(fields.seq_num),
      event_type: fields.event_type || '',
      payload: fields.payload_json ? JSON.parse(fields.payload_json) : {},
      created_at: fields.created_at || null
    }
  };
}

function getRedisOrNull() {
  return getRedisConnection();
}

async function mirrorStreamEvent(row) {
  const redis = getRedisOrNull();

  if (!redis || !row) {
    return {
      mirrored: false,
      reason: 'redis_unconfigured'
    };
  }

  const streamKey = buildRunStreamKey(row.run_id);
  const metaKey = buildRunStreamMetaKey(row.run_id);
  const entryId = await redis.xadd(
    streamKey,
    'MAXLEN',
    '~',
    String(Math.max(10, env.runStreamRedisMaxLen || 1000)),
    '*',
    'id',
    String(row.id || ''),
    'seq_num',
    String(row.seq_num),
    'event_type',
    String(row.event_type || ''),
    'payload_json',
    JSON.stringify(row.payload || {}),
    'created_at',
    String(row.created_at || new Date().toISOString())
  );

  const multi = redis.multi();
  multi.hset(
    metaKey,
    'latestSeq',
    String(row.seq_num),
    'latestRedisId',
    entryId,
    'updatedAt',
    String(row.created_at || new Date().toISOString())
  );

  if (TERMINAL_STREAM_EVENT_TYPES.has(row.event_type)) {
    multi.hset(
      metaKey,
      'terminalEventType',
      row.event_type,
      'terminalSeq',
      String(row.seq_num)
    );
  }

  const ttlSec = Math.max(60, env.runStreamRedisTtlSec || 3600);
  multi.expire(streamKey, ttlSec);
  multi.expire(metaKey, ttlSec);
  await multi.exec();

  return {
    mirrored: true,
    entryId
  };
}

async function publishHotStreamEvent({ runId, eventType, payload, createdAt = null }) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured'
    };
  }

  const streamKey = buildRunStreamKey(runId);
  const metaKey = buildRunStreamMetaKey(runId);
  const seqKey = buildRunStreamSeqKey(runId);
  const occurredAt = createdAt || new Date().toISOString();
  const seqNum = await redis.incr(seqKey);
  const row = {
    id: `hot:${runId}:${seqNum}`,
    run_id: runId,
    seq_num: seqNum,
    event_type: String(eventType || ''),
    payload: payload || {},
    created_at: occurredAt
  };
  const entryId = await redis.xadd(
    streamKey,
    '*',
    'id',
    String(row.id),
    'seq_num',
    String(row.seq_num),
    'event_type',
    row.event_type,
    'payload_json',
    JSON.stringify(row.payload),
    'created_at',
    occurredAt
  );

  const ttlSec = Math.max(60, env.runStreamRedisTtlSec || 3600);
  const multi = redis.multi();
  multi.hset(
    metaKey,
    'latestSeq',
    String(row.seq_num),
    'latestRedisId',
    entryId,
    'updatedAt',
    occurredAt
  );
  multi.hsetnx(metaKey, 'firstSeq', String(row.seq_num));
  multi.hsetnx(metaKey, 'firstRedisId', entryId);

  if (TERMINAL_STREAM_EVENT_TYPES.has(row.event_type)) {
    multi.hset(
      metaKey,
      'terminalEventType',
      row.event_type,
      'terminalSeq',
      String(row.seq_num)
    );
  }

  multi.expire(streamKey, ttlSec);
  multi.expire(metaKey, ttlSec);
  multi.expire(seqKey, ttlSec);
  await multi.exec();

  return {
    available: true,
    row,
    entryId
  };
}

async function listAllHotRunStreamEvents(runId) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured',
      rows: []
    };
  }

  const entries = await redis.xrange(buildRunStreamKey(runId), '-', '+');
  const parsed = (entries || [])
    .map(entry => parseRedisStreamEntry(runId, entry))
    .filter(Boolean)
    .sort((left, right) => left.row.seq_num - right.row.seq_num);

  return {
    available: true,
    rows: parsed.map(entry => entry.row),
    lastRedisId: parsed.length > 0 ? parsed[parsed.length - 1].redisId : null
  };
}

async function markHotRunStreamFlushed({ runId, flushedAt = null, lastSeqNum = null }) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured'
    };
  }

  const metaKey = buildRunStreamMetaKey(runId);
  const ttlSec = Math.max(60, env.runStreamRedisTtlSec || 3600);
  const occurredAt = flushedAt || new Date().toISOString();
  const multi = redis.multi();

  multi.hset(
    metaKey,
    'flushedAt',
    occurredAt,
    'flushStatus',
    'completed'
  );

  if (lastSeqNum != null) {
    multi.hset(metaKey, 'flushedLastSeq', String(lastSeqNum));
  }

  multi.expire(metaKey, ttlSec);
  multi.expire(buildRunStreamKey(runId), ttlSec);
  multi.expire(buildRunStreamSeqKey(runId), ttlSec);
  await multi.exec();

  return {
    available: true,
    flushedAt: occurredAt
  };
}

async function getRunStreamWindow(runId) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured'
    };
  }

  const streamKey = buildRunStreamKey(runId);
  const metaKey = buildRunStreamMetaKey(runId);
  const [firstEntries, lastEntries, metadata] = await Promise.all([
    redis.xrange(streamKey, '-', '+', 'COUNT', 1),
    redis.xrevrange(streamKey, '+', '-', 'COUNT', 1),
    redis.hgetall(metaKey)
  ]);

  if (!Array.isArray(firstEntries) || firstEntries.length === 0 || !Array.isArray(lastEntries) || lastEntries.length === 0) {
    return {
      available: true,
      empty: true,
      firstSeqNum: null,
      lastSeqNum: null,
      firstRedisId: null,
      lastRedisId: metadata && metadata.latestRedisId ? metadata.latestRedisId : null,
      terminalEventType: metadata && metadata.terminalEventType ? metadata.terminalEventType : null
    };
  }

  const firstParsed = parseRedisStreamEntry(runId, firstEntries[0]);
  const lastParsed = parseRedisStreamEntry(runId, lastEntries[0]);

  return {
    available: true,
    empty: false,
    firstSeqNum: firstParsed ? firstParsed.row.seq_num : null,
    lastSeqNum: lastParsed ? lastParsed.row.seq_num : null,
    firstRedisId: firstParsed ? firstParsed.redisId : null,
    lastRedisId: lastParsed ? lastParsed.redisId : (metadata.latestRedisId || null),
    terminalEventType: metadata && metadata.terminalEventType ? metadata.terminalEventType : null
  };
}

async function listHotRunStreamEvents({ runId, afterSeqNum = 0, limit = 200 }) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured',
      rows: []
    };
  }

  const entries = await redis.xrange(
    buildRunStreamKey(runId),
    '-',
    '+',
    'COUNT',
    String(Math.max(limit, 1))
  );

  const parsed = entries
    .map(entry => parseRedisStreamEntry(runId, entry))
    .filter(Boolean)
    .filter(entry => Number.isFinite(entry.row.seq_num) && entry.row.seq_num > afterSeqNum)
    .sort((left, right) => left.row.seq_num - right.row.seq_num)
    .slice(0, limit);

  return {
    available: true,
    rows: parsed.map(entry => entry.row),
    lastRedisId: parsed.length > 0 ? parsed[parsed.length - 1].redisId : null
  };
}

async function waitForHotRunStreamEvents({ runId, lastRedisId = '$', limit = 200, blockMs = 15000 }) {
  const redis = getRedisOrNull();

  if (!redis) {
    return {
      available: false,
      reason: 'redis_unconfigured',
      rows: [],
      lastRedisId
    };
  }

  const response = await redis.xread(
    'BLOCK',
    String(Math.max(0, blockMs)),
    'COUNT',
    String(Math.max(1, limit)),
    'STREAMS',
    buildRunStreamKey(runId),
    lastRedisId || '$'
  );

  if (!response || response.length === 0) {
    return {
      available: true,
      timedOut: true,
      rows: [],
      lastRedisId
    };
  }

  const [, entries] = response[0];
  const parsed = (entries || [])
    .map(entry => parseRedisStreamEntry(runId, entry))
    .filter(Boolean)
    .sort((left, right) => left.row.seq_num - right.row.seq_num);

  return {
    available: true,
    timedOut: false,
    rows: parsed.map(entry => entry.row),
    lastRedisId: parsed.length > 0 ? parsed[parsed.length - 1].redisId : lastRedisId
  };
}

module.exports = {
  getRunStreamWindow,
  listHotRunStreamEvents,
  listAllHotRunStreamEvents,
  markHotRunStreamFlushed,
  mirrorStreamEvent,
  publishHotStreamEvent,
  waitForHotRunStreamEvents
};
