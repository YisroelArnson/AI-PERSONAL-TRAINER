const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { listRecentTranscriptEventsForRun, toRuntimeMessages } = require('./transcript-read.service');

function buildPromptContextCacheKey(run, limit) {
  return `prompt-context:run:${run.run_id}:limit:${limit}`;
}

async function getCachedJson(key) {
  const redis = getRedisConnection();

  if (!redis) {
    return null;
  }

  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function setCachedJson(key, value, ttlSec) {
  const redis = getRedisConnection();

  if (!redis) {
    return;
  }

  await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
}

async function getPromptContextForRun(run, options = {}) {
  const messageLimit = options.messageLimit || 12;
  const cacheKey = buildPromptContextCacheKey(run, messageLimit);

  try {
    const cached = await getCachedJson(cacheKey);

    if (cached) {
      return {
        ...cached,
        cacheHit: true
      };
    }
  } catch (error) {
    console.warn('Prompt context cache read failed:', error.message);
  }

  const events = await listRecentTranscriptEventsForRun(run, messageLimit);
  const context = {
    messages: toRuntimeMessages(events),
    sourceEventIds: events.map(event => event.event_id)
  };

  try {
    await setCachedJson(cacheKey, context, env.promptContextCacheTtlSec);
  } catch (error) {
    console.warn('Prompt context cache write failed:', error.message);
  }

  return {
    ...context,
    cacheHit: false
  };
}

module.exports = {
  getPromptContextForRun
};
