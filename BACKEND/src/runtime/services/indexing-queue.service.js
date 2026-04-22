/**
 * File overview:
 * Implements runtime service logic for indexing queue.
 *
 * Main functions in this file:
 * - readInMemoryDebounce: Reads In memory debounce from its source.
 * - writeInMemoryDebounce: Writes In memory debounce to its destination.
 * - shouldSuppressEnqueue: Handles Should suppress enqueue for indexing-queue.service.js.
 * - enqueueSessionIndexSyncIfNeeded: Enqueues Session index sync if needed for asynchronous work.
 * - enqueueMemoryDocIndexSyncIfNeeded: Enqueues Memory doc index sync if needed for asynchronous work.
 */

const { env } = require('../../config/env');
const { enqueueMemoryDocIndexSync, enqueueSessionIndexSync } = require('../../infra/queue/agent.queue');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getMemoryDocRecord, getSessionIndexState } = require('./indexing-state.service');
const { resolveRetrievalPolicy } = require('./retrieval-policy.service');

const inMemoryDebounceCache = new Map();

/**
 * Reads In memory debounce from its source.
 */
function readInMemoryDebounce(key) {
  const cached = inMemoryDebounceCache.get(key);

  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    inMemoryDebounceCache.delete(key);
    return false;
  }

  return true;
}

/**
 * Writes In memory debounce to its destination.
 */
function writeInMemoryDebounce(key, ttlMs) {
  if (ttlMs <= 0) {
    return;
  }

  inMemoryDebounceCache.set(key, {
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Handles Should suppress enqueue for indexing-queue.service.js.
 */
async function shouldSuppressEnqueue(key, ttlMs) {
  const redis = getRedisConnection();

  if (redis) {
    const cacheHit = await redis.get(key);

    if (cacheHit) {
      return true;
    }

    if (ttlMs > 0) {
      await redis.set(key, '1', 'PX', ttlMs);
    }

    return false;
  }

  if (readInMemoryDebounce(key)) {
    return true;
  }

  writeInMemoryDebounce(key, ttlMs);
  return false;
}

/**
 * Enqueues Session index sync if needed for asynchronous work.
 */
async function enqueueSessionIndexSyncIfNeeded({
  userId,
  sessionKey,
  sessionId,
  retrievalPolicy
}) {
  if (!sessionKey || !sessionId) {
    return null;
  }

  const policy = retrievalPolicy || await resolveRetrievalPolicy(userId);

  if (!policy.sessionIndexingEnabled) {
    return null;
  }

  const state = await getSessionIndexState({
    userId,
    sessionKey,
    sessionId
  });

  if (!state || state.index_dirty !== true) {
    return null;
  }

  const shouldRunImmediately = state.pending_bytes >= policy.sessionDeltaBytes
    || state.pending_messages >= policy.sessionDeltaMessages;
  const debounceKey = `indexing:session:${userId}:${sessionKey}:${sessionId}:${shouldRunImmediately ? 'immediate' : 'debounced'}`;
  const shouldSkip = await shouldSuppressEnqueue(
    debounceKey,
    shouldRunImmediately ? 1000 : env.indexingDebounceMs
  );

  if (shouldSkip) {
    return null;
  }

  return enqueueSessionIndexSync({
    userId,
    sessionKey,
    sessionId,
    mode: shouldRunImmediately ? 'immediate' : 'debounced',
    delayMs: shouldRunImmediately ? 0 : env.indexingDebounceMs
  });
}

/**
 * Enqueues Memory doc index sync if needed for asynchronous work.
 */
async function enqueueMemoryDocIndexSyncIfNeeded({
  userId,
  docId
}) {
  if (!docId) {
    return null;
  }

  const doc = await getMemoryDocRecord({
    userId,
    docId
  });

  if (!doc || doc.index_dirty !== true) {
    return null;
  }

  const shouldSkip = await shouldSuppressEnqueue(
    `indexing:memory-doc:${userId}:${docId}`,
    env.indexingDebounceMs
  );

  if (shouldSkip) {
    return null;
  }

  return enqueueMemoryDocIndexSync({
    userId,
    docId,
    delayMs: env.indexingDebounceMs
  });
}

module.exports = {
  enqueueSessionIndexSyncIfNeeded,
  enqueueMemoryDocIndexSyncIfNeeded
};
