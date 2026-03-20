const { env } = require('../../config/env');
const { getOpenAIClient } = require('../../infra/openai/client');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { sha256Hex } = require('../../shared/hash');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function getDefaultEmbeddingModelKey() {
  return env.defaultOpenAiEmbeddingModel;
}

function isEmbeddingEnabled() {
  return Boolean(env.openaiApiKey && getDefaultEmbeddingModelKey());
}

function formatVectorLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return `[${values.map(value => Number(value)).join(',')}]`;
}

function toVectorLiteral(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return formatVectorLiteral(value);
  }

  return String(value);
}

async function loadCachedEmbeddings(contentHashes, modelKey) {
  const uniqueHashes = [...new Set((contentHashes || []).filter(Boolean))];

  if (uniqueHashes.length === 0) {
    return new Map();
  }

  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('embedding_cache')
    .select('content_hash, model_key, embedding, token_count')
    .eq('model_key', modelKey)
    .in('content_hash', uniqueHashes);

  if (error) {
    throw error;
  }

  return new Map((data || []).map(row => [row.content_hash, row]));
}

async function storeEmbeddings(rows) {
  if (!rows || rows.length === 0) {
    return;
  }

  const supabase = getAdminClientOrThrow();
  const payload = rows.map(row => ({
    content_hash: row.contentHash,
    model_key: row.modelKey,
    embedding: toVectorLiteral(row.embedding),
    token_count: row.tokenCount || null
  }));
  const { error } = await supabase
    .from('embedding_cache')
    .upsert(payload, {
      onConflict: 'content_hash,model_key'
    });

  if (error) {
    throw error;
  }
}

async function embedTexts(texts, options = {}) {
  const items = (texts || []).map(text => String(text || ''));
  if (items.length === 0) {
    return [];
  }

  const modelKey = options.modelKey || getDefaultEmbeddingModelKey();
  const contentHashes = items.map(text => sha256Hex(text));
  const cachedEmbeddings = await loadCachedEmbeddings(contentHashes, modelKey).catch(error => {
    console.warn('Embedding cache lookup failed:', error.message);
    return new Map();
  });
  const results = new Array(items.length);
  const uncached = [];

  for (let index = 0; index < items.length; index += 1) {
    const content = items[index];
    const contentHash = contentHashes[index];
    const cached = cachedEmbeddings.get(contentHash);

    if (cached) {
      results[index] = {
        content,
        contentHash,
        embedding: cached.embedding,
        tokenCount: cached.token_count || null,
        modelKey,
        cacheHit: true
      };
      continue;
    }

    uncached.push({
      index,
      content,
      contentHash
    });
  }

  if (!isEmbeddingEnabled() || uncached.length === 0) {
    for (const item of uncached) {
      results[item.index] = {
        content: item.content,
        contentHash: item.contentHash,
        embedding: null,
        tokenCount: null,
        modelKey,
        cacheHit: false,
        disabled: !isEmbeddingEnabled()
      };
    }

    return results;
  }

  const client = getOpenAIClient();
  const createdRows = [];
  const batchSize = Math.max(1, env.embeddingBatchSize || 32);

  for (let offset = 0; offset < uncached.length; offset += batchSize) {
    const batch = uncached.slice(offset, offset + batchSize);
    const response = await client.embeddings.create({
      model: modelKey,
      input: batch.map(item => item.content)
    });

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const batchItem = batch[batchIndex];
      const embedding = response.data[batchIndex].embedding;
      const row = {
        content: batchItem.content,
        contentHash: batchItem.contentHash,
        embedding,
        tokenCount: null,
        modelKey,
        cacheHit: false
      };

      createdRows.push(row);
      results[batchItem.index] = row;
    }
  }

  await storeEmbeddings(createdRows);

  return results;
}

module.exports = {
  embedTexts,
  formatVectorLiteral,
  getDefaultEmbeddingModelKey,
  isEmbeddingEnabled,
  toVectorLiteral
};
