const { env } = require('../../config/env');
const { enqueueMemoryDocIndexSync, enqueueSessionIndexSync } = require('../../infra/queue/agent.queue');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getMemoryDocRecord, getSessionIndexState } = require('./indexing-state.service');
const { resolveRetrievalPolicy } = require('./retrieval-policy.service');

const inMemoryDebounceCache = new Map();

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

function writeInMemoryDebounce(key, ttlMs) {
  if (ttlMs <= 0) {
    return;
  }

  inMemoryDebounceCache.set(key, {
    expiresAt: Date.now() + ttlMs
  });
}

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
