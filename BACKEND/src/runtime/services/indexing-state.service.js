const { getSupabaseAdminClient } = require('../../infra/supabase/client');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function getSessionIndexState({ userId, sessionKey, sessionId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_index_state')
    .select('*')
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markSessionIndexProcessing({ userId, sessionKey, sessionId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_index_state')
    .update({
      index_status: 'processing'
    })
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markSessionIndexCompleted({
  userId,
  sessionKey,
  sessionId,
  lastIndexedSeq,
  lastIndexHash
}) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_index_state')
    .update({
      pending_bytes: 0,
      pending_messages: 0,
      last_indexed_seq: lastIndexedSeq,
      last_index_hash: lastIndexHash,
      index_dirty: false,
      index_status: 'indexed',
      index_dirty_reason: null,
      last_indexed_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markSessionIndexFailed({ userId, sessionKey, sessionId, reason }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('session_index_state')
    .update({
      index_status: 'failed',
      index_dirty: true,
      index_dirty_reason: reason || 'index_failed'
    })
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getMemoryDocRecord({ userId, docId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('user_id', userId)
    .eq('doc_id', docId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markMemoryDocIndexProcessing({ userId, docId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('memory_docs')
    .update({
      index_status: 'processing'
    })
    .eq('user_id', userId)
    .eq('doc_id', docId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markMemoryDocIndexCompleted({
  userId,
  docId,
  lastIndexedVersion,
  lastIndexedContentHash
}) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('memory_docs')
    .update({
      index_dirty: false,
      index_status: 'indexed',
      index_dirty_reason: null,
      last_indexed_version: lastIndexedVersion,
      last_indexed_content_hash: lastIndexedContentHash,
      last_indexed_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('doc_id', docId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markMemoryDocIndexFailed({ userId, docId, reason }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('memory_docs')
    .update({
      index_status: 'failed',
      index_dirty: true,
      index_dirty_reason: reason || 'index_failed'
    })
    .eq('user_id', userId)
    .eq('doc_id', docId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

module.exports = {
  getSessionIndexState,
  markSessionIndexProcessing,
  markSessionIndexCompleted,
  markSessionIndexFailed,
  getMemoryDocRecord,
  markMemoryDocIndexProcessing,
  markMemoryDocIndexCompleted,
  markMemoryDocIndexFailed
};
