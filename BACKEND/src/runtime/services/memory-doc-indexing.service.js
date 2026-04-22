/**
 * File overview:
 * Implements runtime service logic for memory doc indexing.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - replaceMemoryChunks: Replaces Memory chunks with updated content.
 * - syncMemoryDocIndex: Handles Sync memory doc index for memory-doc-indexing.service.js.
 */

const { sha256Hex } = require('../../shared/hash');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { chunkMarkdownDeterministically } = require('./chunking.service');
const { embedTexts, toVectorLiteral } = require('./embedding-cache.service');
const {
  getMemoryDocRecord,
  markMemoryDocIndexCompleted,
  markMemoryDocIndexFailed,
  markMemoryDocIndexProcessing
} = require('./indexing-state.service');
const { getLatestDocVersionByDocId } = require('./memory-docs.service');
const { replaceMemoryChunksInRedis } = require('./redis-retrieval-index.service');

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
 * Replaces Memory chunks with updated content.
 */
async function replaceMemoryChunks({ userId, docId, chunks }) {
  const supabase = getAdminClientOrThrow();
  const { error: deleteError } = await supabase
    .from('memory_chunks')
    .delete()
    .eq('user_id', userId)
    .eq('doc_id', docId);

  if (deleteError) {
    throw deleteError;
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  const { data, error: insertError } = await supabase
    .from('memory_chunks')
    .insert(chunks)
    .select('*');

  if (insertError) {
    throw insertError;
  }

  return data || [];
}

/**
 * Handles Sync memory doc index for memory-doc-indexing.service.js.
 */
async function syncMemoryDocIndex({
  userId,
  docId
}) {
  const docRecord = await getMemoryDocRecord({
    userId,
    docId
  });

  if (!docRecord) {
    return {
      status: 'skipped',
      reason: 'missing_doc'
    };
  }

  if (docRecord.index_dirty !== true) {
    return {
      status: 'noop',
      reason: 'already_current',
      docId
    };
  }

  await markMemoryDocIndexProcessing({
    userId,
    docId
  });

  try {
    const latestRecord = await getLatestDocVersionByDocId(userId, docId);

    if (!latestRecord || !latestRecord.version) {
      const insertedChunks = await replaceMemoryChunks({
        userId,
        docId,
        chunks: []
      });

      try {
        await replaceMemoryChunksInRedis({
          userId,
          docId,
          chunks: insertedChunks
        });
      } catch (redisError) {
        console.warn('Memory chunk Redis mirror failed:', redisError.message);
      }

      await markMemoryDocIndexCompleted({
        userId,
        docId,
        lastIndexedVersion: 0,
        lastIndexedContentHash: null
      });

      return {
        status: 'indexed',
        docId,
        chunkCount: 0
      };
    }

    if (
      docRecord.last_indexed_version === latestRecord.version.version
      && docRecord.last_indexed_content_hash === latestRecord.version.content_hash
    ) {
      await markMemoryDocIndexCompleted({
        userId,
        docId,
        lastIndexedVersion: latestRecord.version.version,
        lastIndexedContentHash: latestRecord.version.content_hash
      });

      return {
        status: 'noop',
        reason: 'already_current',
        docId
      };
    }

    const chunks = chunkMarkdownDeterministically(latestRecord.version.content);
    const embeddings = await embedTexts(chunks.map(chunk => chunk.content));
    const indexedChunks = chunks.map((chunk, index) => ({
      user_id: userId,
      doc_id: latestRecord.doc.doc_id,
      doc_version: latestRecord.version.version,
      doc_type: latestRecord.doc.doc_type,
      source_key: latestRecord.doc.doc_key,
      start_offset: chunk.startOffset,
      end_offset: chunk.endOffset,
      content: chunk.content,
      content_hash: sha256Hex(chunk.content),
      embedding_model: embeddings[index] && embeddings[index].embedding ? embeddings[index].modelKey : null,
      embedding: embeddings[index] ? toVectorLiteral(embeddings[index].embedding) : null
    }));

    const insertedChunks = await replaceMemoryChunks({
      userId,
      docId,
      chunks: indexedChunks
    });

    try {
      await replaceMemoryChunksInRedis({
        userId,
        docId,
        chunks: insertedChunks
      });
    } catch (redisError) {
      console.warn('Memory chunk Redis mirror failed:', redisError.message);
    }

    await markMemoryDocIndexCompleted({
      userId,
      docId,
      lastIndexedVersion: latestRecord.version.version,
      lastIndexedContentHash: latestRecord.version.content_hash
    });

    return {
      status: 'indexed',
      docId,
      docKey: latestRecord.doc.doc_key,
      chunkCount: insertedChunks.length,
      embeddingEnabled: insertedChunks.some(chunk => Boolean(chunk.embedding_model))
    };
  } catch (error) {
    await markMemoryDocIndexFailed({
      userId,
      docId,
      reason: error.message ? error.message.slice(0, 200) : 'index_failed'
    });

    throw error;
  }
}

module.exports = {
  syncMemoryDocIndex
};
