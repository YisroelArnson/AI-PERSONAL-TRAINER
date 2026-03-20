const { env } = require('../../config/env');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { embedTexts, toVectorLiteral } = require('./embedding-cache.service');
const { resolveRetrievalPolicy } = require('./retrieval-policy.service');

const ALLOWED_SOURCES = new Set(['sessions', 'memory', 'program', 'episodic_date']);

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function normalizeSources(inputSources, fallbackSources) {
  const values = Array.isArray(inputSources) ? inputSources : fallbackSources;
  const normalized = [...new Set((values || [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => ALLOWED_SOURCES.has(value)))];

  return normalized.length > 0 ? normalized : fallbackSources;
}

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
  const queryEmbedding = embeddingRows[0] && embeddingRows[0].embedding
    ? toVectorLiteral(embeddingRows[0].embedding)
    : null;
  const requestedBackend = policy.queryBackend;
  const effectiveBackend = 'postgres_fallback';
  const policySnapshot = {
    requestedBackend,
    effectiveBackend,
    maxResults: resolvedMaxResults,
    candidateMultiplier: policy.queryCandidateMultiplier,
    sources: effectiveSources,
    embeddingEnabled: Boolean(queryEmbedding),
    minScore: env.retrievalMinScore
  };
  const queryRecord = await createRetrievalQuery({
    userId,
    sessionKey,
    runId,
    queryText: normalizedQuery,
    policySnapshot
  });
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase.rpc('retrieval_search_postgres_fallback', {
    p_user_id: userId,
    p_query_text: normalizedQuery,
    p_sources: effectiveSources,
    p_max_results: resolvedMaxResults,
    p_candidate_limit: candidateLimit,
    p_min_score: env.retrievalMinScore,
    p_embedding_model: queryEmbedding ? embeddingRows[0].modelKey : null,
    p_embedding_text: queryEmbedding
  });

  if (error) {
    throw error;
  }

  const results = (data || []).map(row => ({
    sourceType: row.source_type,
    sourceId: row.source_id,
    startSeqOrOffset: row.start_seq_or_offset,
    endSeqOrOffset: row.end_seq_or_offset,
    chunkId: row.chunk_id,
    content: row.content,
    score: Number(row.score || 0),
    vectorScore: Number(row.vector_score || 0),
    ftsScore: Number(row.fts_score || 0)
  }));

  await writeRetrievalAuditResults(queryRecord.query_id, results);

  return {
    queryId: queryRecord.query_id,
    queryText: normalizedQuery,
    backend: effectiveBackend,
    requestedBackend,
    maxResults: resolvedMaxResults,
    candidateLimit,
    sources: effectiveSources,
    results
  };
}

module.exports = {
  retrievalSearch
};
