/**
 * File overview:
 * Implements runtime service logic for rate limit policy.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildCacheKey: Builds a Cache key used by this file.
 * - isPlainObject: Handles Is plain object for rate-limit-policy.service.js.
 * - getNestedValue: Gets Nested value needed by this file.
 * - firstDefinedValue: Handles First defined value for rate-limit-policy.service.js.
 * - normalizePositiveInteger: Normalizes Positive integer into the format this file expects.
 * - normalizeNonNegativeInteger: Normalizes Non negative integer into the format this file expects.
 * - normalizePositiveNumber: Normalizes Positive number into the format this file expects.
 * - normalizeNonNegativeNumber: Normalizes Non negative number into the format this file expects.
 * - buildEffectiveRateLimitPolicy: Builds an Effective rate limit policy used by this file.
 * - readInMemoryCache: Reads In memory cache from its source.
 * - writeInMemoryCache: Writes In memory cache to its destination.
 * - readCachedPolicy: Reads Cached policy from its source.
 * - writeCachedPolicy: Writes Cached policy to its destination.
 * - loadPolicyInputs: Loads Policy inputs for the surrounding workflow.
 * - resolveRateLimitPolicy: Resolves Rate limit policy before the next step runs.
 */

const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const GLOBAL_RATE_LIMIT_POLICY_DEFAULTS = Object.freeze({
  planTier: 'standard',
  messages: Object.freeze({
    capacity: 100,
    refillPerSecond: 5,
    deviceCapacity: 100,
    deviceRefillPerSecond: 5,
    ipCapacity: 100,
    ipRefillPerSecond: 5
  }),
  retryHintSeconds: 30
});

const PLAN_RATE_LIMIT_POLICY_DEFAULTS = Object.freeze({
  memory_only: Object.freeze({
    messages: Object.freeze({
      capacity: 100,
      refillPerSecond: 5,
      deviceCapacity: 100,
      deviceRefillPerSecond: 5,
      ipCapacity: 100,
      ipRefillPerSecond: 5
    }),
    retryHintSeconds: 30
  }),
  standard: Object.freeze({}),
  premium_hybrid: Object.freeze({
    messages: Object.freeze({
      capacity: 100,
      refillPerSecond: 5,
      deviceCapacity: 100,
      deviceRefillPerSecond: 5,
      ipCapacity: 100,
      ipRefillPerSecond: 5
    }),
    retryHintSeconds: 15
  })
});

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
  return `rate-limit-policy:user:${userId}`;
}

/**
 * Handles Is plain object for rate-limit-policy.service.js.
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
 * Handles First defined value for rate-limit-policy.service.js.
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
 * Normalizes Positive integer into the format this file expects.
 */
function normalizePositiveInteger(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced) || coerced <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(coerced));
}

/**
 * Normalizes Non negative integer into the format this file expects.
 */
function normalizeNonNegativeInteger(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced) || coerced < 0) {
    return fallback;
  }

  return Math.max(0, Math.floor(coerced));
}

/**
 * Normalizes Positive number into the format this file expects.
 */
function normalizePositiveNumber(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced) || coerced <= 0) {
    return fallback;
  }

  return coerced;
}

/**
 * Normalizes Non negative number into the format this file expects.
 */
function normalizeNonNegativeNumber(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced) || coerced < 0) {
    return fallback;
  }

  return coerced;
}

/**
 * Builds an Effective rate limit policy used by this file.
 */
function buildEffectiveRateLimitPolicy({ planTier, policyOverrides }) {
  const normalizedPlanTier = planTier || GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.planTier;
  const planDefaults = PLAN_RATE_LIMIT_POLICY_DEFAULTS[normalizedPlanTier] || {};
  const overrides = isPlainObject(policyOverrides) ? policyOverrides : {};

  const messageCapacityOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'capacity'],
    ['rate_limit', 'messages', 'capacity']
  ]);
  const messageRefillOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'refillPerSecond'],
    ['rate_limit', 'messages', 'refill_per_second']
  ]);
  const messageDeviceCapacityOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'deviceCapacity'],
    ['rate_limit', 'messages', 'device_capacity']
  ]);
  const messageDeviceRefillOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'deviceRefillPerSecond'],
    ['rate_limit', 'messages', 'device_refill_per_second']
  ]);
  const messageIpCapacityOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'ipCapacity'],
    ['rate_limit', 'messages', 'ip_capacity']
  ]);
  const messageIpRefillOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'messages', 'ipRefillPerSecond'],
    ['rate_limit', 'messages', 'ip_refill_per_second']
  ]);
  const retryHintSecondsOverride = firstDefinedValue(overrides, [
    ['rateLimit', 'retryHintSeconds'],
    ['rate_limit', 'retry_hint_seconds']
  ]);

  return {
    planTier: normalizedPlanTier,
    messages: {
      capacity: normalizePositiveInteger(
        messageCapacityOverride,
        normalizePositiveInteger(
          planDefaults.messages && planDefaults.messages.capacity,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.capacity
        )
      ),
      refillPerSecond: normalizePositiveNumber(
        messageRefillOverride,
        normalizePositiveNumber(
          planDefaults.messages && planDefaults.messages.refillPerSecond,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.refillPerSecond
        )
      ),
      deviceCapacity: normalizeNonNegativeInteger(
        messageDeviceCapacityOverride,
        normalizeNonNegativeInteger(
          planDefaults.messages && planDefaults.messages.deviceCapacity,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.deviceCapacity
        )
      ),
      deviceRefillPerSecond: normalizeNonNegativeNumber(
        messageDeviceRefillOverride,
        normalizeNonNegativeNumber(
          planDefaults.messages && planDefaults.messages.deviceRefillPerSecond,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.deviceRefillPerSecond
        )
      ),
      ipCapacity: normalizeNonNegativeInteger(
        messageIpCapacityOverride,
        normalizeNonNegativeInteger(
          planDefaults.messages && planDefaults.messages.ipCapacity,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.ipCapacity
        )
      ),
      ipRefillPerSecond: normalizeNonNegativeNumber(
        messageIpRefillOverride,
        normalizeNonNegativeNumber(
          planDefaults.messages && planDefaults.messages.ipRefillPerSecond,
          GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.messages.ipRefillPerSecond
        )
      )
    },
    retryHintSeconds: normalizeNonNegativeInteger(
      retryHintSecondsOverride,
      normalizeNonNegativeInteger(
        planDefaults.retryHintSeconds,
        GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.retryHintSeconds
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
    planTier: data ? data.plan_tier : GLOBAL_RATE_LIMIT_POLICY_DEFAULTS.planTier,
    policyOverrides: data ? data.policy_overrides_json : {}
  };
}

/**
 * Resolves Rate limit policy before the next step runs.
 */
async function resolveRateLimitPolicy(userId, options = {}) {
  const cacheTtlSec = Math.max(0, env.rateLimitPolicyCacheTtlSec || 0);
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
      console.warn('Rate limit policy cache read failed:', error.message);
    }
  }

  const inputs = await loadPolicyInputs(userId);
  const policy = buildEffectiveRateLimitPolicy(inputs);

  if (!skipCache) {
    try {
      await writeCachedPolicy(cacheKey, policy, cacheTtlSec);
    } catch (error) {
      console.warn('Rate limit policy cache write failed:', error.message);
    }
  }

  return {
    ...policy,
    cacheHit: false
  };
}

module.exports = {
  buildEffectiveRateLimitPolicy,
  resolveRateLimitPolicy
};
