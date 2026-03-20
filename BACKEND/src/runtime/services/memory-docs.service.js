const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { sha256Hex } = require('../../shared/hash');
const { enqueueMemoryDocIndexSyncIfNeeded } = require('./indexing-queue.service');
const { isValidDateKey } = require('./timezone-date.service');

const MUTABLE_DOCUMENT_DOC_KEYS = new Set(['MEMORY', 'PROGRAM']);
const EPISODIC_DATE_PREFIX = 'EPISODIC_DATE:';

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function buildEpisodicDateDocKey(dateKey) {
  if (!isValidDateKey(dateKey)) {
    throw new Error('Invalid episodic date key');
  }

  return `${EPISODIC_DATE_PREFIX}${dateKey}`;
}

function getMutableDocTypeForDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();

  if (!MUTABLE_DOCUMENT_DOC_KEYS.has(normalizedDocKey)) {
    return null;
  }

  return normalizedDocKey;
}

function replaceSingleOccurrence(haystack, oldText, newText) {
  const source = String(haystack || '');
  const needle = String(oldText || '');
  const replacement = String(newText || '');

  if (!needle) {
    return {
      ok: false,
      code: 'EMPTY_OLD_TEXT',
      occurrenceCount: 0,
      content: source
    };
  }

  const firstIndex = source.indexOf(needle);
  if (firstIndex < 0) {
    return {
      ok: false,
      code: 'TEXT_NOT_FOUND',
      occurrenceCount: 0,
      content: source
    };
  }

  const lastIndex = source.lastIndexOf(needle);
  if (firstIndex !== lastIndex) {
    return {
      ok: false,
      code: 'TEXT_NOT_UNIQUE',
      occurrenceCount: source.split(needle).length - 1,
      content: source
    };
  }

  return {
    ok: true,
    code: 'OK',
    occurrenceCount: 1,
    content: `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + needle.length)}`
  };
}

function buildAppendedMarkdown(existingContent, markdownBlock) {
  const current = String(existingContent || '').trimEnd();
  const block = String(markdownBlock || '').trim();

  if (!block) {
    return current ? `${current}\n` : '';
  }

  if (!current) {
    return `${block}\n`;
  }

  return `${current}\n\n${block}\n`;
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

async function getLatestDocVersionByDocId(userId, docId) {
  const supabase = getAdminClientOrThrow();
  const { data: doc, error: docError } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('user_id', userId)
    .eq('doc_id', docId)
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

async function getLatestDocVersionsByDocKeys(userId, docKeys) {
  const uniqueDocKeys = [...new Set((docKeys || []).filter(Boolean))];

  if (uniqueDocKeys.length === 0) {
    return [];
  }

  const supabase = getAdminClientOrThrow();
  const { data: docs, error: docsError } = await supabase
    .from('memory_docs')
    .select('*')
    .eq('user_id', userId)
    .in('doc_key', uniqueDocKeys);

  if (docsError) {
    throw docsError;
  }

  const docsWithVersions = (docs || []).filter(doc => doc.current_version > 0);
  if (docsWithVersions.length === 0) {
    return [];
  }

  const { data: versions, error: versionsError } = await supabase
    .from('memory_doc_versions')
    .select('*')
    .in('doc_id', docsWithVersions.map(doc => doc.doc_id));

  if (versionsError) {
    throw versionsError;
  }

  const versionsByCompositeKey = new Map(
    (versions || []).map(version => [`${version.doc_id}:${version.version}`, version])
  );

  return uniqueDocKeys
    .map(docKey => docsWithVersions.find(doc => doc.doc_key === docKey))
    .filter(Boolean)
    .map(doc => ({
      doc,
      version: versionsByCompositeKey.get(`${doc.doc_id}:${doc.current_version}`)
    }))
    .filter(record => Boolean(record.version));
}

async function writeMemoryDocVersion({
  userId,
  docType,
  docKey,
  content,
  expectedVersion,
  updatedByActor,
  updatedByRunId
}) {
  const supabase = getAdminClientOrThrow();
  const normalizedContent = String(content || '');
  const { data, error } = await supabase.rpc('write_memory_doc_version', {
    p_user_id: userId,
    p_doc_type: docType,
    p_doc_key: docKey,
    p_content: normalizedContent,
    p_content_hash: sha256Hex(normalizedContent),
    p_expected_version: expectedVersion,
    p_updated_by_actor: updatedByActor,
    p_updated_by_run_id: updatedByRunId || null
  });

  if (error) {
    throw error;
  }

  if (data && data.changed !== false && data.docId) {
    try {
      await enqueueMemoryDocIndexSyncIfNeeded({
        userId,
        docId: data.docId
      });
    } catch (queueError) {
      console.warn('Unable to enqueue memory-doc indexing job:', queueError.message);
    }
  }

  return data;
}

async function replaceMutableDocument({
  userId,
  docKey,
  markdown,
  expectedVersion,
  updatedByActor,
  updatedByRunId
}) {
  const docType = getMutableDocTypeForDocKey(docKey);

  if (!docType) {
    throw new Error('DOC_KEY_NOT_MUTABLE');
  }

  return writeMemoryDocVersion({
    userId,
    docType,
    docKey: docType,
    content: String(markdown || ''),
    expectedVersion,
    updatedByActor,
    updatedByRunId
  });
}

async function replaceMutableDocumentText({
  userId,
  docKey,
  oldText,
  newText,
  expectedVersion,
  updatedByActor,
  updatedByRunId
}) {
  const docType = getMutableDocTypeForDocKey(docKey);

  if (!docType) {
    throw new Error('DOC_KEY_NOT_MUTABLE');
  }

  const currentRecord = await getLatestDocVersionByDocKey(userId, docType);
  const currentVersion = currentRecord ? currentRecord.doc.current_version : 0;

  if (currentVersion !== expectedVersion) {
    throw new Error('VERSION_MISMATCH');
  }

  const replacement = replaceSingleOccurrence(
    currentRecord ? currentRecord.version.content : '',
    oldText,
    newText
  );

  if (!replacement.ok) {
    const error = new Error(replacement.code);
    error.occurrenceCount = replacement.occurrenceCount;
    throw error;
  }

  return writeMemoryDocVersion({
    userId,
    docType,
    docKey: docType,
    content: replacement.content,
    expectedVersion,
    updatedByActor,
    updatedByRunId
  });
}

async function appendEpisodicNoteBlock({
  userId,
  dateKey,
  markdownBlock,
  updatedByActor,
  updatedByRunId,
  maxRetries = 3
}) {
  const docKey = buildEpisodicDateDocKey(dateKey);
  const block = String(markdownBlock || '').trim();

  if (!block) {
    throw new Error('EMPTY_MARKDOWN_BLOCK');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const currentRecord = await getLatestDocVersionByDocKey(userId, docKey);
    const currentContent = currentRecord ? currentRecord.version.content : '';

    if (currentContent.includes(block)) {
      return {
        status: 'noop',
        docKey,
        dateKey,
        docId: currentRecord ? currentRecord.doc.doc_id : null,
        currentVersion: currentRecord ? currentRecord.doc.current_version : 0,
        changed: false
      };
    }

    try {
      const result = await writeMemoryDocVersion({
        userId,
        docType: 'EPISODIC_DATE',
        docKey,
        content: buildAppendedMarkdown(currentContent, block),
        expectedVersion: currentRecord ? currentRecord.doc.current_version : 0,
        updatedByActor,
        updatedByRunId
      });

      return {
        ...result,
        dateKey,
        status: result.changed === false ? 'noop' : 'updated'
      };
    } catch (error) {
      if (
        attempt < maxRetries &&
        error &&
        error.message &&
        error.message.includes('VERSION_MISMATCH')
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('EPISODIC_APPEND_RETRY_EXHAUSTED');
}

module.exports = {
  buildAppendedMarkdown,
  buildEpisodicDateDocKey,
  getLatestDocVersionByDocKey,
  getLatestDocVersionByDocId,
  getLatestDocVersionByDocType,
  getLatestDocVersionsByDocKeys,
  getMutableDocTypeForDocKey,
  replaceMutableDocument,
  replaceMutableDocumentText,
  replaceSingleOccurrence,
  appendEpisodicNoteBlock
};
