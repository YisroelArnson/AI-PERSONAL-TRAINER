const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const GLOBAL_CONCURRENCY_POLICY_DEFAULTS = Object.freeze({
  planTier: 'standard',
  maxActiveRuns: 20,
  maxActiveStreams: 20,
  maxActiveStreamsPerDevice: 20,
  retryHintSeconds: 30
});

const PLAN_CONCURRENCY_POLICY_DEFAULTS = Object.freeze({
  memory_only: Object.freeze({}),
  standard: Object.freeze({}),
  premium_hybrid: Object.freeze({})
});

const inMemoryPolicyCache = new Map();

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function buildCacheKey(userId) {
  return `concurrency-policy:user:${userId}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function firstDefinedValue(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

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

function buildEffectiveConcurrencyPolicy({ planTier, policyOverrides }) {
  const normalizedPlanTier = planTier || GLOBAL_CONCURRENCY_POLICY_DEFAULTS.planTier;
  const planDefaults = PLAN_CONCURRENCY_POLICY_DEFAULTS[normalizedPlanTier] || {};
  const overrides = isPlainObject(policyOverrides) ? policyOverrides : {};

  const maxActiveRunsOverride = firstDefinedValue(overrides, [
    ['concurrency', 'maxActiveRuns'],
    ['concurrency', 'max_active_runs']
  ]);
  const maxActiveStreamsOverride = firstDefinedValue(overrides, [
    ['concurrency', 'maxActiveStreams'],
    ['concurrency', 'max_active_streams']
  ]);
  const maxActiveStreamsPerDeviceOverride = firstDefinedValue(overrides, [
    ['concurrency', 'maxActiveStreamsPerDevice'],
    ['concurrency', 'max_active_streams_per_device']
  ]);
  const retryHintSecondsOverride = firstDefinedValue(overrides, [
    ['concurrency', 'retryHintSeconds'],
    ['concurrency', 'retry_hint_seconds'],
    ['rateLimit', 'retryHintSeconds'],
    ['rate_limit', 'retry_hint_seconds']
  ]);

  return {
    planTier: normalizedPlanTier,
    maxActiveRuns: normalizeNonNegativeInteger(
      maxActiveRunsOverride,
      normalizeNonNegativeInteger(
        planDefaults.maxActiveRuns,
        GLOBAL_CONCURRENCY_POLICY_DEFAULTS.maxActiveRuns
      )
    ),
    maxActiveStreams: normalizeNonNegativeInteger(
      maxActiveStreamsOverride,
      normalizeNonNegativeInteger(
        planDefaults.maxActiveStreams,
        GLOBAL_CONCURRENCY_POLICY_DEFAULTS.maxActiveStreams
      )
    ),
    maxActiveStreamsPerDevice: normalizeNonNegativeInteger(
      maxActiveStreamsPerDeviceOverride,
      normalizeNonNegativeInteger(
        planDefaults.maxActiveStreamsPerDevice,
        GLOBAL_CONCURRENCY_POLICY_DEFAULTS.maxActiveStreamsPerDevice
      )
    ),
    retryHintSeconds: normalizeNonNegativeInteger(
      retryHintSecondsOverride,
      normalizeNonNegativeInteger(
        planDefaults.retryHintSeconds,
        GLOBAL_CONCURRENCY_POLICY_DEFAULTS.retryHintSeconds
      )
    )
  };
}

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

function writeInMemoryCache(cacheKey, value, ttlSec) {
  if (ttlSec <= 0) {
    return;
  }

  inMemoryPolicyCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlSec * 1000
  });
}

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

async function writeCachedPolicy(cacheKey, value, ttlSec) {
  const redis = getRedisConnection();

  if (redis && ttlSec > 0) {
    await redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSec);
  }

  writeInMemoryCache(cacheKey, value, ttlSec);
}

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
    planTier: data ? data.plan_tier : GLOBAL_CONCURRENCY_POLICY_DEFAULTS.planTier,
    policyOverrides: data ? data.policy_overrides_json : {}
  };
}

async function resolveConcurrencyPolicy(userId, options = {}) {
  const cacheTtlSec = Math.max(0, env.concurrencyPolicyCacheTtlSec || 0);
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
      console.warn('Concurrency policy cache read failed:', error.message);
    }
  }

  const inputs = await loadPolicyInputs(userId);
  const policy = buildEffectiveConcurrencyPolicy(inputs);

  if (!skipCache) {
    try {
      await writeCachedPolicy(cacheKey, policy, cacheTtlSec);
    } catch (error) {
      console.warn('Concurrency policy cache write failed:', error.message);
    }
  }

  return {
    ...policy,
    cacheHit: false
  };
}

module.exports = {
  buildEffectiveConcurrencyPolicy,
  resolveConcurrencyPolicy
};
