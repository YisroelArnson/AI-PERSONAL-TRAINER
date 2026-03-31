const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { sha256Hex } = require('../../shared/hash');
const { enqueueMemoryDocIndexSyncIfNeeded } = require('./indexing-queue.service');
const { isValidDateKey } = require('./timezone-date.service');

const COACH_SOUL_DOC_KEY = 'COACH_SOUL';
const MUTABLE_DOCUMENT_DOC_KEYS = new Set(['MEMORY', 'PROGRAM']);
const ENTIRE_DOCUMENT_DOC_KEYS = new Set(['MEMORY', 'PROGRAM', COACH_SOUL_DOC_KEY]);
const EPISODIC_DATE_PREFIX = 'EPISODIC_DATE:';
const CACHEABLE_DOC_KEYS = new Set([COACH_SOUL_DOC_KEY, 'MEMORY', 'PROGRAM']);

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

function isCacheableDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();
  return CACHEABLE_DOC_KEYS.has(normalizedDocKey) || normalizedDocKey.startsWith(EPISODIC_DATE_PREFIX);
}

function buildLatestDocCacheKey(userId, docKey) {
  return `memory-doc:latest:${userId}:${String(docKey || '').trim().toUpperCase()}`;
}

function buildLatestDocByIdCacheKey(userId, docId) {
  return `memory-doc:latest-by-id:${userId}:${docId}`;
}

function getRedisOrNull() {
  return getRedisConnection();
}

function normalizeCachedRecord(record) {
  if (!record || !record.doc || !record.version) {
    return null;
  }

  return {
    doc: record.doc,
    version: record.version
  };
}

async function getCachedLatestDocRecordByKey(userId, docKey) {
  if (!isCacheableDocKey(docKey)) {
    return null;
  }

  const redis = getRedisOrNull();
  if (!redis) {
    return null;
  }

  const raw = await redis.get(buildLatestDocCacheKey(userId, docKey));
  if (!raw) {
    return null;
  }

  return normalizeCachedRecord(JSON.parse(raw));
}

async function getCachedLatestDocRecordById(userId, docId) {
  const redis = getRedisOrNull();
  if (!redis || !docId) {
    return null;
  }

  const raw = await redis.get(buildLatestDocByIdCacheKey(userId, docId));
  if (!raw) {
    return null;
  }

  return normalizeCachedRecord(JSON.parse(raw));
}

async function cacheLatestDocRecord(record) {
  const normalized = normalizeCachedRecord(record);
  if (!normalized || !normalized.doc || !isCacheableDocKey(normalized.doc.doc_key)) {
    return;
  }

  const redis = getRedisOrNull();
  if (!redis) {
    return;
  }

  const payload = JSON.stringify(normalized);
  const ttlSec = Math.max(60, env.documentCacheTtlSec || 3600);
  const multi = redis.multi();
  multi.set(buildLatestDocCacheKey(normalized.doc.user_id, normalized.doc.doc_key), payload, 'EX', ttlSec);

  if (normalized.doc.doc_id) {
    multi.set(buildLatestDocByIdCacheKey(normalized.doc.user_id, normalized.doc.doc_id), payload, 'EX', ttlSec);
  }

  await multi.exec();
}

async function loadLatestDocVersionByDocTypeFromDb(userId, docType) {
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

async function loadLatestDocVersionByDocKeyFromDb(userId, docKey) {
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

async function loadLatestDocVersionByDocIdFromDb(userId, docId) {
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

async function loadLatestDocVersionsByDocKeysFromDb(userId, docKeys) {
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

function getMutableDocTypeForDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();

  if (!MUTABLE_DOCUMENT_DOC_KEYS.has(normalizedDocKey)) {
    return null;
  }

  return normalizedDocKey;
}

function getEntireDocumentDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();

  if (!ENTIRE_DOCUMENT_DOC_KEYS.has(normalizedDocKey)) {
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
  const normalizedDocType = String(docType || '').trim().toUpperCase();

  if (CACHEABLE_DOC_KEYS.has(normalizedDocType)) {
    return getLatestDocVersionByDocKey(userId, normalizedDocType);
  }

  const record = await loadLatestDocVersionByDocTypeFromDb(userId, docType);

  if (record) {
    try {
      await cacheLatestDocRecord(record);
    } catch (error) {
      console.warn('Memory doc cache write failed:', error.message);
    }
  }

  return record;
}

async function getLatestDocVersionByDocKey(userId, docKey) {
  try {
    const cached = await getCachedLatestDocRecordByKey(userId, docKey);

    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('Memory doc cache read failed:', error.message);
  }

  const record = await loadLatestDocVersionByDocKeyFromDb(userId, docKey);

  if (record) {
    try {
      await cacheLatestDocRecord(record);
    } catch (error) {
      console.warn('Memory doc cache write failed:', error.message);
    }
  }

  return record;
}

async function getLatestDocVersionByDocId(userId, docId) {
  try {
    const cached = await getCachedLatestDocRecordById(userId, docId);

    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('Memory doc cache read failed:', error.message);
  }

  const record = await loadLatestDocVersionByDocIdFromDb(userId, docId);

  if (record) {
    try {
      await cacheLatestDocRecord(record);
    } catch (error) {
      console.warn('Memory doc cache write failed:', error.message);
    }
  }

  return record;
}

async function getLatestDocVersionsByDocKeys(userId, docKeys) {
  const uniqueDocKeys = [...new Set((docKeys || []).filter(Boolean))];

  if (uniqueDocKeys.length === 0) {
    return [];
  }

  const cachedRecordsByKey = new Map();
  const missingDocKeys = [];

  for (const docKey of uniqueDocKeys) {
    try {
      const cached = await getCachedLatestDocRecordByKey(userId, docKey);

      if (cached) {
        cachedRecordsByKey.set(String(docKey), cached);
        continue;
      }
    } catch (error) {
      console.warn('Memory doc cache read failed:', error.message);
    }

    missingDocKeys.push(docKey);
  }

  if (missingDocKeys.length > 0) {
    const loadedRecords = await loadLatestDocVersionsByDocKeysFromDb(userId, missingDocKeys);

    for (const record of loadedRecords) {
      cachedRecordsByKey.set(record.doc.doc_key, record);

      try {
        await cacheLatestDocRecord(record);
      } catch (error) {
        console.warn('Memory doc cache write failed:', error.message);
      }
    }
  }

  return uniqueDocKeys
    .map(docKey => cachedRecordsByKey.get(docKey))
    .filter(Boolean);
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

  if (data && data.docId && isCacheableDocKey(data.docKey)) {
    try {
      await cacheLatestDocRecord({
        doc: {
          doc_id: data.docId,
          user_id: userId,
          doc_type: data.docType,
          doc_key: data.docKey,
          current_version: data.currentVersion,
          updated_at: new Date().toISOString()
        },
        version: {
          doc_id: data.docId,
          version: data.currentVersion,
          content: normalizedContent,
          content_hash: sha256Hex(normalizedContent),
          updated_by_actor: updatedByActor,
          updated_by_run_id: updatedByRunId || null,
          created_at: new Date().toISOString()
        }
      });
    } catch (cacheError) {
      console.warn('Memory doc cache write failed after mutation:', cacheError.message);
    }
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
  const normalizedDocKey = getEntireDocumentDocKey(docKey);

  if (!normalizedDocKey) {
    throw new Error('DOC_KEY_NOT_MUTABLE');
  }

  return writeMemoryDocVersion({
    userId,
    docType: normalizedDocKey,
    docKey: normalizedDocKey,
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
  COACH_SOUL_DOC_KEY,
  getLatestDocVersionByDocKey,
  getLatestDocVersionByDocId,
  getLatestDocVersionByDocType,
  getLatestDocVersionsByDocKeys,
  getMutableDocTypeForDocKey,
  replaceMutableDocument,
  replaceMutableDocumentText,
  replaceSingleOccurrence,
  appendEpisodicNoteBlock,
  writeMemoryDocVersion
};
