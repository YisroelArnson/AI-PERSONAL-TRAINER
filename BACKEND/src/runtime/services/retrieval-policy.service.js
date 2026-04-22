/**
 * File overview:
 * Implements runtime service logic for retrieval policy.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildCacheKey: Builds a Cache key used by this file.
 * - isPlainObject: Handles Is plain object for retrieval-policy.service.js.
 * - getNestedValue: Gets Nested value needed by this file.
 * - firstDefinedValue: Handles First defined value for retrieval-policy.service.js.
 * - normalizeBoolean: Normalizes Boolean into the format this file expects.
 * - normalizePositiveInteger: Normalizes Positive integer into the format this file expects.
 * - normalizeNullableInteger: Normalizes Nullable integer into the format this file expects.
 * - normalizeBackend: Normalizes Backend into the format this file expects.
 * - normalizeSources: Normalizes Sources into the format this file expects.
 * - buildEffectiveRetrievalPolicy: Builds an Effective retrieval policy used by this file.
 * - readInMemoryCache: Reads In memory cache from its source.
 * - writeInMemoryCache: Writes In memory cache to its destination.
 * - readCachedPolicy: Reads Cached policy from its source.
 * - writeCachedPolicy: Writes Cached policy to its destination.
 * - loadPolicyInputs: Loads Policy inputs for the surrounding workflow.
 * - resolveRetrievalPolicy: Resolves Retrieval policy before the next step runs.
 */

const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const GLOBAL_RETRIEVAL_POLICY_DEFAULTS = Object.freeze({
  planTier: 'standard',
  sessionIndexingEnabled: true,
  sessionDeltaBytes: 4096,
  sessionDeltaMessages: 5,
  queryMaxResults: 8,
  queryCandidateMultiplier: 4,
  queryBackend: 'redis_hybrid',
  sources: ['sessions', 'memory', 'program', 'episodic_date'],
  embeddingMonthlyBudget: null
});

const PLAN_RETRIEVAL_POLICY_DEFAULTS = Object.freeze({
  memory_only: {},
  standard: {},
  premium_hybrid: {}
});

const ALLOWED_SOURCES = new Set(['sessions', 'memory', 'program', 'episodic_date']);
const ALLOWED_BACKENDS = new Set(['redis_hybrid', 'postgres_fallback']);
const inMemoryPolicyCache = new Map();

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
 * Builds a Cache key used by this file.
 */
function buildCacheKey(userId) {
  return `retrieval-policy:user:${userId}`;
}

/**
 * Handles Is plain object for retrieval-policy.service.js.
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Gets Nested value needed by this file.
 */
function getNestedValue(source, path) {
  let current = source;

  for (const key of path) {
    if (!isPlainObject(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

/**
 * Handles First defined value for retrieval-policy.service.js.
 */
function firstDefinedValue(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * Normalizes Boolean into the format this file expects.
 */
function normalizeBoolean(rawValue, fallback) {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
}

/**
 * Normalizes Positive integer into the format this file expects.
 */
function normalizePositiveInteger(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(1, Math.floor(coerced));
}

/**
 * Normalizes Nullable integer into the format this file expects.
 */
function normalizeNullableInteger(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(0, Math.floor(coerced));
}

/**
 * Normalizes Backend into the format this file expects.
 */
function normalizeBackend(rawValue, fallback) {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  return ALLOWED_BACKENDS.has(normalized) ? normalized : fallback;
}

/**
 * Normalizes Sources into the format this file expects.
 */
function normalizeSources(rawValue, fallback) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === 'string'
      ? rawValue.split(',')
      : null;

  if (!values) {
    return fallback;
  }

  const normalized = [...new Set(values
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => ALLOWED_SOURCES.has(value)))];

  return normalized.length > 0 ? normalized : fallback;
}

/**
 * Builds an Effective retrieval policy used by this file.
 */
function buildEffectiveRetrievalPolicy({ planTier, policyOverrides }) {
  const normalizedPlanTier = planTier || GLOBAL_RETRIEVAL_POLICY_DEFAULTS.planTier;
  const planDefaults = PLAN_RETRIEVAL_POLICY_DEFAULTS[normalizedPlanTier] || {};
  const overrides = isPlainObject(policyOverrides) ? policyOverrides : {};
  const sessionIndexingEnabledOverride = firstDefinedValue(overrides, [
    ['sessionIndexing', 'enabled'],
    ['session_indexing', 'enabled']
  ]);
  const sessionDeltaBytesOverride = firstDefinedValue(overrides, [
    ['sync', 'sessions', 'deltaBytes'],
    ['sync', 'sessions', 'delta_bytes']
  ]);
  const sessionDeltaMessagesOverride = firstDefinedValue(overrides, [
    ['sync', 'sessions', 'deltaMessages'],
    ['sync', 'sessions', 'delta_messages']
  ]);
  const queryMaxResultsOverride = firstDefinedValue(overrides, [
    ['query', 'maxResults'],
    ['query', 'max_results']
  ]);
  const candidateMultiplierOverride = firstDefinedValue(overrides, [
    ['query', 'candidateMultiplier'],
    ['query', 'candidate_multiplier']
  ]);
  const queryBackendOverride = firstDefinedValue(overrides, [
    ['query', 'backend']
  ]);
  const sourcesOverride = firstDefinedValue(overrides, [
    ['sources']
  ]);
  const embeddingMonthlyBudgetOverride = firstDefinedValue(overrides, [
    ['embedding', 'monthlyBudget'],
    ['embedding', 'monthly_budget']
  ]);

  return {
    planTier: normalizedPlanTier,
    sessionIndexingEnabled: normalizeBoolean(
      sessionIndexingEnabledOverride,
      normalizeBoolean(
        planDefaults.sessionIndexingEnabled,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.sessionIndexingEnabled
      )
    ),
    sessionDeltaBytes: normalizePositiveInteger(
      sessionDeltaBytesOverride,
      normalizePositiveInteger(
        planDefaults.sessionDeltaBytes,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.sessionDeltaBytes
      )
    ),
    sessionDeltaMessages: normalizePositiveInteger(
      sessionDeltaMessagesOverride,
      normalizePositiveInteger(
        planDefaults.sessionDeltaMessages,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.sessionDeltaMessages
      )
    ),
    queryMaxResults: normalizePositiveInteger(
      queryMaxResultsOverride,
      normalizePositiveInteger(
        planDefaults.queryMaxResults,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.queryMaxResults
      )
    ),
    queryCandidateMultiplier: normalizePositiveInteger(
      candidateMultiplierOverride,
      normalizePositiveInteger(
        planDefaults.queryCandidateMultiplier,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.queryCandidateMultiplier
      )
    ),
    queryBackend: normalizeBackend(
      queryBackendOverride,
      normalizeBackend(
        planDefaults.queryBackend,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.queryBackend
      )
    ),
    sources: normalizeSources(
      sourcesOverride,
      normalizeSources(
        planDefaults.sources,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.sources
      )
    ),
    embeddingMonthlyBudget: normalizeNullableInteger(
      embeddingMonthlyBudgetOverride,
      normalizeNullableInteger(
        planDefaults.embeddingMonthlyBudget,
        GLOBAL_RETRIEVAL_POLICY_DEFAULTS.embeddingMonthlyBudget
      )
    )
  };
}

/**
 * Reads In memory cache from its source.
 */
function readInMemoryCache(cacheKey) {
  const cached = inMemoryPolicyCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    inMemoryPolicyCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

/**
 * Writes In memory cache to its destination.
 */
function writeInMemoryCache(cacheKey, value, ttlSec) {
  if (ttlSec <= 0) {
    return;
  }

  inMemoryPolicyCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlSec * 1000
  });
}

/**
 * Reads Cached policy from its source.
 */
async function readCachedPolicy(cacheKey) {
  const redis = getRedisConnection();

  if (redis) {
    const raw = await redis.get(cacheKey);

    if (raw) {
      return JSON.parse(raw);
    }
  }

  return readInMemoryCache(cacheKey);
}

/**
 * Writes Cached policy to its destination.
 */
async function writeCachedPolicy(cacheKey, value, ttlSec) {
  const redis = getRedisConnection();

  if (redis && ttlSec > 0) {
    await redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSec);
  }

  writeInMemoryCache(cacheKey, value, ttlSec);
}

/**
 * Loads Policy inputs for the surrounding workflow.
 */
async function loadPolicyInputs(userId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('user_plan_settings')
    .select('plan_tier, policy_overrides_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    planTier: data ? data.plan_tier : GLOBAL_RETRIEVAL_POLICY_DEFAULTS.planTier,
    policyOverrides: data ? data.policy_overrides_json : {}
  };
}

/**
 * Resolves Retrieval policy before the next step runs.
 */
async function resolveRetrievalPolicy(userId, options = {}) {
  const cacheTtlSec = Math.max(0, env.indexingPolicyCacheTtlSec || 0);
  const cacheKey = buildCacheKey(userId);
  const skipCache = options.skipCache === true || cacheTtlSec === 0;

  if (!skipCache) {
    try {
      const cached = await readCachedPolicy(cacheKey);

      if (cached) {
        return {
          ...cached,
          cacheHit: true
        };
      }
    } catch (error) {
      console.warn('Retrieval policy cache read failed:', error.message);
    }
  }

  const inputs = await loadPolicyInputs(userId);
  const policy = buildEffectiveRetrievalPolicy(inputs);

  if (!skipCache) {
    try {
      await writeCachedPolicy(cacheKey, policy, cacheTtlSec);
    } catch (error) {
      console.warn('Retrieval policy cache write failed:', error.message);
    }
  }

  return {
    ...policy,
    cacheHit: false
  };
}

module.exports = {
  buildEffectiveRetrievalPolicy,
  resolveRetrievalPolicy
};
