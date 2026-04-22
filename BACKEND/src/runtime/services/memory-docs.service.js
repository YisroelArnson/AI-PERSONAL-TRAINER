/**
 * File overview:
 * Implements runtime service logic for memory docs.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildEpisodicDateDocKey: Builds an Episodic date doc key used by this file.
 * - isCacheableDocKey: Handles Is cacheable doc key for memory-docs.service.js.
 * - buildLatestDocCacheKey: Builds a Latest doc cache key used by this file.
 * - buildLatestDocByIdCacheKey: Builds a Latest doc by ID cache key used by this file.
 * - getRedisOrNull: Gets Redis or null needed by this file.
 * - normalizeCachedRecord: Normalizes Cached record into the format this file expects.
 * - getCachedLatestDocRecordByKey: Gets Cached latest doc record by key needed by this file.
 * - getCachedLatestDocRecordById: Gets Cached latest doc record by ID needed by this file.
 * - cacheLatestDocRecord: Handles Cache latest doc record for memory-docs.service.js.
 * - loadLatestDocVersionByDocTypeFromDb: Loads Latest doc version by doc type from DB for the surrounding workflow.
 * - loadLatestDocVersionByDocKeyFromDb: Loads Latest doc version by doc key from DB for the surrounding workflow.
 * - loadLatestDocVersionByDocIdFromDb: Loads Latest doc version by doc ID from DB for the surrounding workflow.
 * - loadLatestDocVersionsByDocKeysFromDb: Loads Latest doc versions by doc keys from DB for the surrounding workflow.
 * - getMutableDocTypeForDocKey: Gets Mutable doc type for doc key needed by this file.
 * - getEntireDocumentDocKey: Gets Entire document doc key needed by this file.
 * - replaceSingleOccurrence: Replaces Single occurrence with updated content.
 * - buildAppendedMarkdown: Builds an Appended markdown used by this file.
 * - getLatestDocVersionByDocType: Gets Latest doc version by doc type needed by this file.
 * - getLatestDocVersionByDocKey: Gets Latest doc version by doc key needed by this file.
 * - getLatestDocVersionByDocId: Gets Latest doc version by doc ID needed by this file.
 * - getLatestDocVersionsByDocKeys: Gets Latest doc versions by doc keys needed by this file.
 * - writeMemoryDocVersion: Writes Memory doc version to its destination.
 * - replaceMutableDocument: Replaces Mutable document with updated content.
 * - replaceMutableDocumentText: Replaces Mutable document text with updated content.
 * - appendEpisodicNoteBlock: Appends Episodic note block to the existing record.
 */

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
 * Builds an Episodic date doc key used by this file.
 */
function buildEpisodicDateDocKey(dateKey) {
  if (!isValidDateKey(dateKey)) {
    throw new Error('Invalid episodic date key');
  }

  return `${EPISODIC_DATE_PREFIX}${dateKey}`;
}

/**
 * Handles Is cacheable doc key for memory-docs.service.js.
 */
function isCacheableDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();
  return CACHEABLE_DOC_KEYS.has(normalizedDocKey) || normalizedDocKey.startsWith(EPISODIC_DATE_PREFIX);
}

/**
 * Builds a Latest doc cache key used by this file.
 */
function buildLatestDocCacheKey(userId, docKey) {
  return `memory-doc:latest:${userId}:${String(docKey || '').trim().toUpperCase()}`;
}

/**
 * Builds a Latest doc by ID cache key used by this file.
 */
function buildLatestDocByIdCacheKey(userId, docId) {
  return `memory-doc:latest-by-id:${userId}:${docId}`;
}

/**
 * Gets Redis or null needed by this file.
 */
function getRedisOrNull() {
  return getRedisConnection();
}

/**
 * Normalizes Cached record into the format this file expects.
 */
function normalizeCachedRecord(record) {
  if (!record || !record.doc || !record.version) {
    return null;
  }

  return {
    doc: record.doc,
    version: record.version
  };
}

/**
 * Gets Cached latest doc record by key needed by this file.
 */
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

/**
 * Gets Cached latest doc record by ID needed by this file.
 */
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

/**
 * Handles Cache latest doc record for memory-docs.service.js.
 */
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

/**
 * Loads Latest doc version by doc type from DB for the surrounding workflow.
 */
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

/**
 * Loads Latest doc version by doc key from DB for the surrounding workflow.
 */
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

/**
 * Loads Latest doc version by doc ID from DB for the surrounding workflow.
 */
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

/**
 * Loads Latest doc versions by doc keys from DB for the surrounding workflow.
 */
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

/**
 * Gets Mutable doc type for doc key needed by this file.
 */
function getMutableDocTypeForDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();

  if (!MUTABLE_DOCUMENT_DOC_KEYS.has(normalizedDocKey)) {
    return null;
  }

  return normalizedDocKey;
}

/**
 * Gets Entire document doc key needed by this file.
 */
function getEntireDocumentDocKey(docKey) {
  const normalizedDocKey = String(docKey || '').trim().toUpperCase();

  if (!ENTIRE_DOCUMENT_DOC_KEYS.has(normalizedDocKey)) {
    return null;
  }

  return normalizedDocKey;
}

/**
 * Replaces Single occurrence with updated content.
 */
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

/**
 * Builds an Appended markdown used by this file.
 */
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

/**
 * Gets Latest doc version by doc type needed by this file.
 */
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

/**
 * Gets Latest doc version by doc key needed by this file.
 */
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

/**
 * Gets Latest doc version by doc ID needed by this file.
 */
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

/**
 * Gets Latest doc versions by doc keys needed by this file.
 */
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

/**
 * Writes Memory doc version to its destination.
 */
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

/**
 * Replaces Mutable document with updated content.
 */
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

/**
 * Replaces Mutable document text with updated content.
 */
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

/**
 * Appends Episodic note block to the existing record.
 */
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
