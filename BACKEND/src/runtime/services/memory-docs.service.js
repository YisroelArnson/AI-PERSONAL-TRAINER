const { getSupabaseAdminClient } = require('../../infra/supabase/client');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function getLatestDocVersionByDocType(userId, docType) {
  const supabase = getAdminClientOrThrow();
  const { data: doc, error: docError } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('user_id', userId)
    .eq('doc_type', docType)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docError) {
    throw docError;
  }

  if (!doc || !doc.current_version) {
    return null;
  }

  const { data: version, error: versionError } = await supabase
    .from('memory_doc_versions')
    .select('*')
    .eq('doc_id', doc.doc_id)
    .eq('version', doc.current_version)
    .maybeSingle();

  if (versionError) {
    throw versionError;
  }

  if (!version) {
    return null;
  }

  return {
    doc,
    version
  };
}

async function getLatestDocVersionByDocKey(userId, docKey) {
  const supabase = getAdminClientOrThrow();
  const { data: doc, error: docError } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('user_id', userId)
    .eq('doc_key', docKey)
    .maybeSingle();

  if (docError) {
    throw docError;
  }

  if (!doc || !doc.current_version) {
    return null;
  }

  const { data: version, error: versionError } = await supabase
    .from('memory_doc_versions')
    .select('*')
    .eq('doc_id', doc.doc_id)
    .eq('version', doc.current_version)
    .maybeSingle();

  if (versionError) {
    throw versionError;
  }

  if (!version) {
    return null;
  }

  return {
    doc,
    version
  };
}

module.exports = {
  getLatestDocVersionByDocKey,
  getLatestDocVersionByDocType
};
