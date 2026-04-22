/**
 * File overview:
 * Implements runtime service logic for retrieval search.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - normalizeSources: Normalizes Sources into the format this file expects.
 * - createRetrievalQuery: Creates a Retrieval query used by this file.
 * - searchPostgresFallback: Handles Search postgres fallback for retrieval-search.service.js.
 * - writeRetrievalAuditResults: Writes Retrieval audit results to its destination.
 * - retrievalSearch: Handles Retrieval search for retrieval-search.service.js.
 */

const { env } = require('../../config/env');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { embedTexts, parseVector, toVectorLiteral } = require('./embedding-cache.service');
const { searchRedisRetrievalIndex } = require('./redis-retrieval-index.service');
const { resolveRetrievalPolicy } = require('./retrieval-policy.service');

const ALLOWED_SOURCES = new Set(['sessions', 'memory', 'program', 'episodic_date']);

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Normalizes Sources into the format this file expects.
 */
function normalizeSources(inputSources, fallbackSources) {
  const values = Array.isArray(inputSources) ? inputSources : fallbackSources;
  const normalized = [...new Set((values || [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => ALLOWED_SOURCES.has(value)))];

  return normalized.length > 0 ? normalized : fallbackSources;
}

/**
 * Creates a Retrieval query used by this file.
 */
async function createRetrievalQuery({
  userId,
  sessionKey,
  runId,
  queryText,
  policySnapshot
}) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('retrieval_queries')
    .insert({
      user_id: userId,
      session_key: sessionKey || null,
      run_id: runId || null,
      query_text: queryText,
      policy_snapshot_json: policySnapshot || {}
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Handles Search postgres fallback for retrieval-search.service.js.
 */
async function searchPostgresFallback({
  userId,
  normalizedQuery,
  effectiveSources,
  resolvedMaxResults,
  candidateLimit,
  queryEmbedding
}) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase.rpc('retrieval_search_postgres_fallback', {
    p_user_id: userId,
    p_query_text: normalizedQuery,
    p_sources: effectiveSources,
    p_max_results: resolvedMaxResults,
    p_candidate_limit: candidateLimit,
    p_min_score: env.retrievalMinScore,
    p_embedding_model: queryEmbedding && queryEmbedding.modelKey ? queryEmbedding.modelKey : null,
    p_embedding_text: queryEmbedding && queryEmbedding.vectorLiteral ? queryEmbedding.vectorLiteral : null
  });

  if (error) {
    throw error;
  }

  return {
    backend: 'postgres_fallback',
    mode: queryEmbedding && queryEmbedding.values ? 'hybrid' : 'text_only',
    warnings: [],
    results: (data || []).map(row => ({
      sourceType: row.source_type,
      sourceId: row.source_id,
      startSeqOrOffset: row.start_seq_or_offset,
      endSeqOrOffset: row.end_seq_or_offset,
      chunkId: row.chunk_id,
      content: row.content,
      score: Number(row.score || 0),
      vectorScore: Number(row.vector_score || 0),
      ftsScore: Number(row.fts_score || 0)
    }))
  };
}

/**
 * Writes Retrieval audit results to its destination.
 */
async function writeRetrievalAuditResults(queryId, results) {
  if (!results || results.length === 0) {
    return;
  }

  const supabase = getAdminClientOrThrow();
  const { error } = await supabase
    .from('retrieval_results_audit')
    .insert(results.map((result, index) => ({
      query_id: queryId,
      source_type: result.sourceType,
      source_id: result.sourceId,
      start_seq_or_offset: result.startSeqOrOffset,
      end_seq_or_offset: result.endSeqOrOffset,
      chunk_id: result.chunkId,
      score: result.score,
      rank: index + 1
    })));

  if (error) {
    throw error;
  }
}

/**
 * Handles Retrieval search for retrieval-search.service.js.
 */
async function retrievalSearch({
  userId,
  sessionKey,
  runId,
  queryText,
  sources,
  maxResults
}) {
  const normalizedQuery = String(queryText || '').trim();

  if (!normalizedQuery) {
    throw new Error('EMPTY_RETRIEVAL_QUERY');
  }

  const policy = await resolveRetrievalPolicy(userId);
  const effectiveSources = normalizeSources(sources, policy.sources);
  const resolvedMaxResults = Math.max(1, Math.min(
    Number(maxResults) || policy.queryMaxResults,
    policy.queryMaxResults
  ));
  const candidateLimit = resolvedMaxResults * policy.queryCandidateMultiplier;
  const embeddingRows = await embedTexts([normalizedQuery]);
  const rawEmbedding = embeddingRows[0] && embeddingRows[0].embedding
    ? embeddingRows[0].embedding
    : null;
  const queryEmbedding = rawEmbedding
    ? {
      values: parseVector(rawEmbedding),
      vectorLiteral: toVectorLiteral(rawEmbedding),
      modelKey: embeddingRows[0].modelKey
    }
    : null;
  const requestedBackend = policy.queryBackend;
  let effectiveBackend = 'postgres_fallback';
  let fallbackReason = null;
  let retrievalResult;

  if (requestedBackend === 'redis_hybrid') {
    try {
      const redisResult = await searchRedisRetrievalIndex({
        userId,
        queryText: normalizedQuery,
        sourceTypes: effectiveSources,
        maxResults: resolvedMaxResults,
        candidateLimit,
        queryEmbedding: queryEmbedding && queryEmbedding.values,
        queryEmbeddingModel: queryEmbedding && queryEmbedding.modelKey
      });

      if (redisResult && redisResult.results.length > 0) {
        const filteredRedisResults = redisResult.results
          .filter(result => Number(result.score || 0) >= env.retrievalMinScore)
          .map(result => ({
            sourceType: result.sourceType,
            sourceId: result.sourceId,
            startSeqOrOffset: result.startSeqOrOffset,
            endSeqOrOffset: result.endSeqOrOffset,
            chunkId: result.chunkId,
            content: result.content,
            score: Number(result.score || 0),
            vectorScore: null,
            ftsScore: null
          }));

        if (filteredRedisResults.length > 0) {
          retrievalResult = {
          backend: redisResult.backend,
          mode: redisResult.mode,
          warnings: redisResult.warnings || [],
            results: filteredRedisResults
          };
          effectiveBackend = 'redis_hybrid';
        } else {
          fallbackReason = 'redis_below_min_score';
        }
      } else {
        fallbackReason = redisResult ? 'redis_empty' : 'redis_unconfigured';
      }
    } catch (redisError) {
      fallbackReason = redisError.message ? redisError.message.slice(0, 120) : 'redis_error';
    }
  }

  if (!retrievalResult) {
    retrievalResult = await searchPostgresFallback({
      userId,
      normalizedQuery,
      effectiveSources,
      resolvedMaxResults,
      candidateLimit,
      queryEmbedding
    });
    effectiveBackend = 'postgres_fallback';
  }

  const policySnapshot = {
    requestedBackend,
    effectiveBackend,
    maxResults: resolvedMaxResults,
    candidateMultiplier: policy.queryCandidateMultiplier,
    sources: effectiveSources,
    embeddingEnabled: Boolean(queryEmbedding && queryEmbedding.values),
    minScore: env.retrievalMinScore,
    redisFallbackReason: fallbackReason
  };
  const queryRecord = await createRetrievalQuery({
    userId,
    sessionKey,
    runId,
    queryText: normalizedQuery,
    policySnapshot
  });
  const results = retrievalResult.results || [];

  await writeRetrievalAuditResults(queryRecord.query_id, results);

  return {
    queryId: queryRecord.query_id,
    queryText: normalizedQuery,
    backend: effectiveBackend,
    requestedBackend,
    fallbackReason,
    maxResults: resolvedMaxResults,
    candidateLimit,
    sources: effectiveSources,
    results
  };
}

module.exports = {
  retrievalSearch
};
