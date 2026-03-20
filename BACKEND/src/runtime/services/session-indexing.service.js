const { sha256Hex } = require('../../shared/hash');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { chunkSessionEntriesDeterministically } = require('./chunking.service');
const { embedTexts, toVectorLiteral } = require('./embedding-cache.service');
const {
  getSessionIndexState,
  markSessionIndexCompleted,
  markSessionIndexFailed,
  markSessionIndexProcessing
} = require('./indexing-state.service');
const { resolveRetrievalPolicy } = require('./retrieval-policy.service');
const { shouldIncludeSessionMemoryEvent } = require('./session-memory-flush.service');
const { listTranscriptEventsForSession } = require('./transcript-read.service');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function toIndexableSessionEntries(events) {
  return (events || [])
    .filter(shouldIncludeSessionMemoryEvent)
    .map(event => ({
      seqNum: event.seq_num,
      actor: event.actor,
      text: String(event.payload && (event.payload.text || event.payload.message) || '').trim()
    }))
    .filter(entry => entry.text);
}

async function replaceSessionChunks({ userId, sessionKey, sessionId, chunks }) {
  const supabase = getAdminClientOrThrow();
  const { error: deleteError } = await supabase
    .from('session_index_chunks')
    .delete()
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId);

  if (deleteError) {
    throw deleteError;
  }

  if (!chunks || chunks.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('session_index_chunks')
    .insert(chunks);

  if (insertError) {
    throw insertError;
  }
}

async function syncSessionIndex({
  userId,
  sessionKey,
  sessionId,
  retrievalPolicy
}) {
  const policy = retrievalPolicy || await resolveRetrievalPolicy(userId);
  const state = await getSessionIndexState({
    userId,
    sessionKey,
    sessionId
  });

  if (!state) {
    return {
      status: 'skipped',
      reason: 'missing_state'
    };
  }

  if (!policy.sessionIndexingEnabled) {
    return {
      status: 'skipped',
      reason: 'disabled'
    };
  }

  if (state.index_dirty !== true) {
    return {
      status: 'noop',
      reason: 'already_current',
      sessionId
    };
  }

  await markSessionIndexProcessing({
    userId,
    sessionKey,
    sessionId
  });

  try {
    const events = await listTranscriptEventsForSession({
      userId,
      sessionKey,
      sessionId
    });
    const maxSeqNum = events.length > 0 ? events[events.length - 1].seq_num : 0;
    const entries = toIndexableSessionEntries(events);
    const canonicalContent = entries
      .map(entry => `[${entry.seqNum}] ${entry.actor}: ${entry.text}`)
      .join('\n');
    const canonicalHash = sha256Hex(canonicalContent);

    if (canonicalHash === state.last_index_hash && maxSeqNum === state.last_indexed_seq) {
      await markSessionIndexCompleted({
        userId,
        sessionKey,
        sessionId,
        lastIndexedSeq: maxSeqNum,
        lastIndexHash: canonicalHash
      });

      return {
        status: 'noop',
        reason: 'already_current',
        sessionId
      };
    }

    const chunks = chunkSessionEntriesDeterministically(entries);
    const embeddings = await embedTexts(chunks.map(chunk => chunk.content));
    const indexedChunks = chunks.map((chunk, index) => ({
      user_id: userId,
      session_key: sessionKey,
      session_id: sessionId,
      start_seq_num: chunk.startSeqNum,
      end_seq_num: chunk.endSeqNum,
      content: chunk.content,
      content_hash: sha256Hex(chunk.content),
      embedding_model: embeddings[index] && embeddings[index].embedding ? embeddings[index].modelKey : null,
      embedding: embeddings[index] ? toVectorLiteral(embeddings[index].embedding) : null
    }));

    await replaceSessionChunks({
      userId,
      sessionKey,
      sessionId,
      chunks: indexedChunks
    });

    await markSessionIndexCompleted({
      userId,
      sessionKey,
      sessionId,
      lastIndexedSeq: maxSeqNum,
      lastIndexHash: canonicalHash
    });

    return {
      status: 'indexed',
      sessionId,
      chunkCount: indexedChunks.length,
      indexedSeqNum: maxSeqNum,
      embeddingEnabled: indexedChunks.some(chunk => Boolean(chunk.embedding_model))
    };
  } catch (error) {
    await markSessionIndexFailed({
      userId,
      sessionKey,
      sessionId,
      reason: error.message ? error.message.slice(0, 200) : 'index_failed'
    });

    throw error;
  }
}

module.exports = {
  syncSessionIndex,
  toIndexableSessionEntries
};
