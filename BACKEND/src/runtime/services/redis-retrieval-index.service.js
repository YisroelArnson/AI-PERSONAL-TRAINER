const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const {
  getDefaultEmbeddingDimensions,
  getDefaultEmbeddingModelKey,
  parseVector,
  toFloat32Buffer
} = require('./embedding-cache.service');

const INDEX_READY_CACHE_TTL_MS = 60 * 1000;
const SEARCHABLE_SOURCE_TYPES = new Set(['sessions', 'memory', 'program', 'episodic_date']);
const ensuredIndexCache = new Map();

function isRedisMissingIndexError(error) {
  return /Unknown Index name|no such index/i.test(error && error.message || '');
}

function sanitizeRedisSegment(value) {
  const normalized = String(value || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'default';
}

function escapeRedisTagValue(value) {
  return String(value || '').replace(/([^A-Za-z0-9_])/g, '\\$1');
}

function tokenizeRedisSearchText(queryText) {
  const tokens = String(queryText || '').match(/[A-Za-z0-9_]+/g) || [];
  return tokens.map(token => token.trim()).filter(Boolean);
}

function getRedisRetrievalModelKey(modelKey) {
  return modelKey || getDefaultEmbeddingModelKey();
}

function getRedisRetrievalIndexName(modelKey = getRedisRetrievalModelKey()) {
  return `idx:trainer_chunks:${sanitizeRedisSegment(modelKey)}`;
}

function getRedisChunkKeyPrefix(modelKey = getRedisRetrievalModelKey()) {
  return `rchunk:${sanitizeRedisSegment(modelKey)}:`;
}

function getRedisChunkKey({ modelKey, chunkId }) {
  return `${getRedisChunkKeyPrefix(modelKey)}${chunkId}`;
}

function getRedisSourceSetKey({ modelKey, sourceRef }) {
  return `rchunksrc:${sanitizeRedisSegment(modelKey)}:${sourceRef}`;
}

function buildRedisSearchFilter({ userId, sourceTypes }) {
  const normalizedSources = (sourceTypes || [])
    .map(sourceType => String(sourceType || '').trim().toLowerCase())
    .filter(sourceType => SEARCHABLE_SOURCE_TYPES.has(sourceType));

  if (!userId || normalizedSources.length === 0) {
    throw new Error('REDIS_SEARCH_FILTER_REQUIRES_USER_AND_SOURCES');
  }

  return [
    `@user_id:{${escapeRedisTagValue(userId)}}`,
    `@source_type:{${normalizedSources.map(escapeRedisTagValue).join('|')}}`
  ].join(' ');
}

function buildRedisTextQuery({ queryText, userId, sourceTypes }) {
  const tokens = tokenizeRedisSearchText(queryText);
  const textClause = tokens.length > 0 ? tokens.join(' ') : '*';
  const filterExpression = buildRedisSearchFilter({ userId, sourceTypes });

  return `${textClause} ${filterExpression}`.trim();
}

function arrayPairsToObject(entries) {
  const output = {};

  for (let index = 0; index < (entries || []).length; index += 2) {
    const key = String(entries[index] || '').replace(/^@/, '');
    output[key] = entries[index + 1];
  }

  return output;
}

function parseRedisHybridSearchResponse(response) {
  const payload = arrayPairsToObject(response);
  const results = Array.isArray(payload.results)
    ? payload.results.map(item => arrayPairsToObject(item))
    : [];

  return {
    totalResults: Number(payload.total_results || 0),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    executionTimeMs: Number(payload.execution_time || 0),
    results: results.map(result => ({
      redisKey: result.__key || null,
      chunkId: result.chunk_id || null,
      sourceType: result.source_type || null,
      sourceId: result.source_id || null,
      startSeqOrOffset: Number(result.start_seq_or_offset || 0),
      endSeqOrOffset: Number(result.end_seq_or_offset || 0),
      content: result.content || '',
      score: Number(result.__score || 0)
    }))
  };
}

function parseRedisTextSearchResponse(response) {
  const totalResults = Number(response && response[0] || 0);
  const results = [];

  for (let index = 1; index < (response || []).length; index += 3) {
    const redisKey = response[index];
    const score = response[index + 1];
    const fields = arrayPairsToObject(response[index + 2] || []);

    results.push({
      redisKey,
      chunkId: fields.chunk_id || null,
      sourceType: fields.source_type || null,
      sourceId: fields.source_id || null,
      startSeqOrOffset: Number(fields.start_seq_or_offset || 0),
      endSeqOrOffset: Number(fields.end_seq_or_offset || 0),
      content: fields.content || '',
      score: Number(score || 0)
    });
  }

  return {
    totalResults,
    warnings: [],
    executionTimeMs: null,
    results
  };
}

function mapMemoryDocTypeToSourceType(docType) {
  if (docType === 'MEMORY') {
    return 'memory';
  }

  if (docType === 'PROGRAM') {
    return 'program';
  }

  if (docType === 'EPISODIC_DATE') {
    return 'episodic_date';
  }

  return String(docType || '').trim().toLowerCase();
}

function getVectorDimensions(value) {
  const vector = parseVector(value);
  return Array.isArray(vector) && vector.length > 0 ? vector.length : null;
}

function getRedisIndexDimensions(vectorValue) {
  return getVectorDimensions(vectorValue) || getDefaultEmbeddingDimensions();
}

function normalizeWeightPair() {
  const rawAlpha = Number.isFinite(env.redisRetrievalVectorAlpha)
    ? Math.max(0, env.redisRetrievalVectorAlpha)
    : 0.65;
  const rawBeta = Number.isFinite(env.redisRetrievalTextBeta)
    ? Math.max(0, env.redisRetrievalTextBeta)
    : 0.35;
  const total = rawAlpha + rawBeta;

  if (total <= 0) {
    return {
      alpha: 0.65,
      beta: 0.35
    };
  }

  return {
    alpha: rawAlpha / total,
    beta: rawBeta / total
  };
}

async function ensureRedisRetrievalIndex({
  modelKey = getRedisRetrievalModelKey(),
  dimension = getDefaultEmbeddingDimensions()
} = {}) {
  const redis = getRedisConnection();

  if (!redis) {
    return null;
  }

  const indexName = getRedisRetrievalIndexName(modelKey);
  const cached = ensuredIndexCache.get(indexName);

  if (cached && cached.expiresAt > Date.now()) {
    return indexName;
  }

  try {
    await redis.call('FT.INFO', indexName);
  } catch (error) {
    if (!isRedisMissingIndexError(error)) {
      throw error;
    }

    const prefix = getRedisChunkKeyPrefix(modelKey);

    try {
      await redis.call(
        'FT.CREATE',
        indexName,
        'ON',
        'HASH',
        'PREFIX',
        '1',
        prefix,
        'SCHEMA',
        'user_id',
        'TAG',
        'source_type',
        'TAG',
        'source_id',
        'TAG',
        'session_key',
        'TAG',
        'session_id',
        'TAG',
        'doc_id',
        'TAG',
        'doc_key',
        'TAG',
        'doc_type',
        'TAG',
        'embedding_model',
        'TAG',
        'chunk_id',
        'TAG',
        'start_seq_or_offset',
        'NUMERIC',
        'SORTABLE',
        'end_seq_or_offset',
        'NUMERIC',
        'updated_at_ms',
        'NUMERIC',
        'SORTABLE',
        'content',
        'TEXT',
        'embedding',
        'VECTOR',
        'FLAT',
        '6',
        'TYPE',
        'FLOAT32',
        'DIM',
        String(Math.max(1, Math.floor(dimension || getDefaultEmbeddingDimensions()))),
        'DISTANCE_METRIC',
        'COSINE'
      );
    } catch (createError) {
      if (!/Index already exists/i.test(createError.message || '')) {
        throw createError;
      }
    }
  }

  ensuredIndexCache.set(indexName, {
    expiresAt: Date.now() + INDEX_READY_CACHE_TTL_MS
  });

  return indexName;
}

function buildSessionSourceRef({ userId, sessionKey, sessionId }) {
  return `session:${userId}:${sessionKey}:${sessionId}`;
}

function buildMemorySourceRef({ userId, docId }) {
  return `memory:${userId}:${docId}`;
}

function toRedisHashFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function buildRedisSessionDocuments({
  userId,
  sessionKey,
  sessionId,
  chunks,
  modelKey = getRedisRetrievalModelKey()
}) {
  const sourceId = `${sessionKey}:${sessionId}`;
  const sourceRef = buildSessionSourceRef({
    userId,
    sessionKey,
    sessionId
  });

  return (chunks || []).map(chunk => ({
    key: getRedisChunkKey({
      modelKey,
      chunkId: chunk.chunk_id
    }),
    sourceRef,
    fields: toRedisHashFields({
      user_id: userId,
      source_type: 'sessions',
      source_id: sourceId,
      session_key: sessionKey,
      session_id: sessionId,
      chunk_id: chunk.chunk_id,
      start_seq_or_offset: String(chunk.start_seq_num),
      end_seq_or_offset: String(chunk.end_seq_num),
      updated_at_ms: String(Date.parse(chunk.updated_at || new Date().toISOString()) || Date.now()),
      content: chunk.content,
      embedding_model: chunk.embedding_model || null,
      embedding: chunk.embedding_model === modelKey ? toFloat32Buffer(chunk.embedding) : null
    })
  }));
}

function buildRedisMemoryDocuments({
  userId,
  docId,
  chunks,
  modelKey = getRedisRetrievalModelKey()
}) {
  const sourceRef = buildMemorySourceRef({
    userId,
    docId
  });

  return (chunks || []).map(chunk => ({
    key: getRedisChunkKey({
      modelKey,
      chunkId: chunk.chunk_id
    }),
    sourceRef,
    fields: toRedisHashFields({
      user_id: userId,
      source_type: mapMemoryDocTypeToSourceType(chunk.doc_type),
      source_id: chunk.source_key,
      doc_id: docId,
      doc_key: chunk.source_key,
      doc_type: chunk.doc_type,
      chunk_id: chunk.chunk_id,
      start_seq_or_offset: String(chunk.start_offset),
      end_seq_or_offset: String(chunk.end_offset),
      updated_at_ms: String(Date.parse(chunk.updated_at || new Date().toISOString()) || Date.now()),
      content: chunk.content,
      embedding_model: chunk.embedding_model || null,
      embedding: chunk.embedding_model === modelKey ? toFloat32Buffer(chunk.embedding) : null
    })
  }));
}

async function assertRedisMultiSucceeded(results) {
  for (const result of results || []) {
    if (result && result[0]) {
      throw result[0];
    }
  }
}

async function replaceRedisSourceDocuments({
  modelKey = getRedisRetrievalModelKey(),
  sourceRef,
  documents
}) {
  const redis = getRedisConnection();

  if (!redis) {
    return {
      status: 'skipped',
      reason: 'redis_unconfigured'
    };
  }

  await ensureRedisRetrievalIndex({
    modelKey,
    dimension: getDefaultEmbeddingDimensions()
  });

  const sourceSetKey = getRedisSourceSetKey({
    modelKey,
    sourceRef
  });
  const existingKeys = await redis.smembers(sourceSetKey);
  const multi = redis.multi();

  if (existingKeys.length > 0) {
    multi.del(...existingKeys);
  }

  multi.del(sourceSetKey);

  for (const document of documents || []) {
    multi.hset(document.key, document.fields);
    multi.sadd(sourceSetKey, document.key);
  }

  const results = await multi.exec();
  await assertRedisMultiSucceeded(results);

  return {
    status: 'ok',
    sourceRef,
    documentCount: (documents || []).length
  };
}

async function importRedisDocuments({
  modelKey = getRedisRetrievalModelKey(),
  documents
}) {
  const redis = getRedisConnection();

  if (!redis) {
    return {
      status: 'skipped',
      reason: 'redis_unconfigured'
    };
  }

  await ensureRedisRetrievalIndex({
    modelKey,
    dimension: getDefaultEmbeddingDimensions()
  });

  const multi = redis.multi();

  for (const document of documents || []) {
    const sourceSetKey = getRedisSourceSetKey({
      modelKey,
      sourceRef: document.sourceRef
    });

    multi.hset(document.key, document.fields);
    multi.sadd(sourceSetKey, document.key);
  }

  const results = await multi.exec();
  await assertRedisMultiSucceeded(results);

  return {
    status: 'ok',
    documentCount: (documents || []).length
  };
}

async function replaceSessionChunksInRedis({
  userId,
  sessionKey,
  sessionId,
  chunks,
  modelKey = getRedisRetrievalModelKey()
}) {
  return replaceRedisSourceDocuments({
    modelKey,
    sourceRef: buildSessionSourceRef({
      userId,
      sessionKey,
      sessionId
    }),
    documents: buildRedisSessionDocuments({
      userId,
      sessionKey,
      sessionId,
      chunks,
      modelKey
    })
  });
}

async function replaceMemoryChunksInRedis({
  userId,
  docId,
  chunks,
  modelKey = getRedisRetrievalModelKey()
}) {
  return replaceRedisSourceDocuments({
    modelKey,
    sourceRef: buildMemorySourceRef({
      userId,
      docId
    }),
    documents: buildRedisMemoryDocuments({
      userId,
      docId,
      chunks,
      modelKey
    })
  });
}

async function searchRedisRetrievalIndex({
  userId,
  queryText,
  sourceTypes,
  maxResults,
  candidateLimit,
  queryEmbedding,
  queryEmbeddingModel
}) {
  const redis = getRedisConnection();

  if (!redis) {
    return null;
  }

  const modelKey = getRedisRetrievalModelKey(queryEmbeddingModel);
  const dimension = getRedisIndexDimensions(queryEmbedding);
  const indexName = await ensureRedisRetrievalIndex({
    modelKey,
    dimension
  });
  const filterExpression = buildRedisSearchFilter({
    userId,
    sourceTypes
  });
  const textQuery = buildRedisTextQuery({
    queryText,
    userId,
    sourceTypes
  });
  const queryBuffer = toFloat32Buffer(queryEmbedding);

  if (queryBuffer) {
    const { alpha, beta } = normalizeWeightPair();
    const response = await redis.call(
      'FT.HYBRID',
      indexName,
      'SEARCH',
      textQuery,
      'VSIM',
      '@embedding',
      '$query_vec',
      'KNN',
      '2',
      'K',
      String(Math.max(candidateLimit, maxResults)),
      'FILTER',
      filterExpression,
      'COMBINE',
      'LINEAR',
      '6',
      'ALPHA',
      String(alpha),
      'BETA',
      String(beta),
      'WINDOW',
      String(Math.max(candidateLimit, maxResults)),
      'LIMIT',
      '0',
      String(maxResults),
      'LOAD',
      '8',
      '@__key',
      '@__score',
      '@chunk_id',
      '@source_type',
      '@source_id',
      '@start_seq_or_offset',
      '@end_seq_or_offset',
      '@content',
      'PARAMS',
      '2',
      'query_vec',
      queryBuffer
    );

    return {
      backend: 'redis_hybrid',
      mode: 'hybrid',
      ...parseRedisHybridSearchResponse(response)
    };
  }

  const response = await redis.call(
    'FT.SEARCH',
    indexName,
    textQuery,
    'WITHSCORES',
    'RETURN',
    '6',
    'chunk_id',
    'source_type',
    'source_id',
    'start_seq_or_offset',
    'end_seq_or_offset',
    'content',
    'LIMIT',
    '0',
    String(maxResults)
  );

  return {
    backend: 'redis_hybrid',
    mode: 'text_only',
    ...parseRedisTextSearchResponse(response)
  };
}

async function scanAndDeleteKeys(redis, pattern) {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '500');
    cursor = nextCursor;

    if (Array.isArray(keys) && keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function fetchChunkPage({
  table,
  columns,
  offset,
  limit,
  userId
}) {
  const supabase = getAdminClientOrThrow();
  let query = supabase
    .from(table)
    .select(columns)
    .order('chunk_id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function rebuildRedisRetrievalIndex({
  userId = null,
  batchSize = 500,
  modelKey = getRedisRetrievalModelKey()
} = {}) {
  const redis = getRedisConnection();

  if (!redis) {
    return {
      status: 'skipped',
      reason: 'redis_unconfigured'
    };
  }

  const indexName = getRedisRetrievalIndexName(modelKey);
  const sourceSetPattern = `${getRedisSourceSetKey({
    modelKey,
    sourceRef: '*'
  })}`;

  try {
    await redis.call('FT.DROPINDEX', indexName, 'DD');
  } catch (error) {
    if (!isRedisMissingIndexError(error)) {
      throw error;
    }
  }

  ensuredIndexCache.delete(indexName);
  await scanAndDeleteKeys(redis, sourceSetPattern);
  await ensureRedisRetrievalIndex({
    modelKey,
    dimension: getDefaultEmbeddingDimensions()
  });

  let importedSessionChunks = 0;
  let importedMemoryChunks = 0;

  for (let offset = 0; ; offset += batchSize) {
    const rows = await fetchChunkPage({
      table: 'session_index_chunks',
      columns: 'chunk_id,user_id,session_key,session_id,start_seq_num,end_seq_num,content,embedding_model,embedding,updated_at',
      offset,
      limit: batchSize,
      userId
    });

    if (rows.length === 0) {
      break;
    }

    await importRedisDocuments({
      modelKey,
      documents: rows.flatMap(row => buildRedisSessionDocuments({
        userId: row.user_id,
        sessionKey: row.session_key,
        sessionId: row.session_id,
        chunks: [row],
        modelKey
      }))
    });
    importedSessionChunks += rows.length;
  }

  for (let offset = 0; ; offset += batchSize) {
    const rows = await fetchChunkPage({
      table: 'memory_chunks',
      columns: 'chunk_id,user_id,doc_id,doc_type,source_key,start_offset,end_offset,content,embedding_model,embedding,updated_at',
      offset,
      limit: batchSize,
      userId
    });

    if (rows.length === 0) {
      break;
    }

    await importRedisDocuments({
      modelKey,
      documents: rows.flatMap(row => buildRedisMemoryDocuments({
        userId: row.user_id,
        docId: row.doc_id,
        chunks: [row],
        modelKey
      }))
    });
    importedMemoryChunks += rows.length;
  }

  return {
    status: 'ok',
    backend: 'redis_hybrid',
    modelKey,
    sessionChunkCount: importedSessionChunks,
    memoryChunkCount: importedMemoryChunks
  };
}

module.exports = {
  buildRedisMemoryDocuments,
  buildRedisSearchFilter,
  buildRedisSessionDocuments,
  buildRedisTextQuery,
  ensureRedisRetrievalIndex,
  getRedisRetrievalIndexName,
  importRedisDocuments,
  mapMemoryDocTypeToSourceType,
  parseRedisHybridSearchResponse,
  parseRedisTextSearchResponse,
  rebuildRedisRetrievalIndex,
  replaceMemoryChunksInRedis,
  replaceSessionChunksInRedis,
  sanitizeRedisSegment,
  searchRedisRetrievalIndex,
  isRedisMissingIndexError
};
