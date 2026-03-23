const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const GLOBAL_SESSION_CONTINUITY_DEFAULTS = Object.freeze({
  dayBoundaryEnabled: true,
  idleExpiryMinutes: 240,
  planTier: 'standard',
  timezone: 'UTC',
  sessionMemoryEnabled: true,
  sessionMemoryMessageCount: 15,
  episodicReadStrategy: 'today_and_yesterday',
  episodicCustomWindowDays: 2
});

const PLAN_SESSION_CONTINUITY_DEFAULTS = Object.freeze({
  memory_only: {},
  standard: {},
  premium_hybrid: {}
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
  return `session-reset-policy:user:${userId}`;
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

function normalizeTimezone(rawTimezone) {
  if (!rawTimezone || !String(rawTimezone).trim()) {
    return GLOBAL_SESSION_CONTINUITY_DEFAULTS.timezone;
  }

  const timezone = String(rawTimezone).trim();

  try {
    Intl.DateTimeFormat('en-US', {
      timeZone: timezone
    });

    return timezone;
  } catch (error) {
    return GLOBAL_SESSION_CONTINUITY_DEFAULTS.timezone;
  }
}

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

function normalizeNonNegativeInteger(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const coerced = Number(rawValue);
  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(0, Math.floor(coerced));
}

function normalizeReadStrategy(rawValue, fallback) {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if ([
    'today_only',
    'today_and_yesterday',
    'current_week',
    'custom_window_days'
  ].includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function buildEffectiveSessionContinuityPolicy({ planTier, policyOverrides, timezone }) {
  const normalizedPlanTier = planTier || GLOBAL_SESSION_CONTINUITY_DEFAULTS.planTier;
  const planDefaults = PLAN_SESSION_CONTINUITY_DEFAULTS[normalizedPlanTier] || {};
  const overrides = isPlainObject(policyOverrides) ? policyOverrides : {};
  const dayBoundaryOverride = firstDefinedValue(overrides, [
    ['sessionReset', 'dayBoundaryEnabled'],
    ['session_reset', 'day_boundary_enabled']
  ]);
  const idleExpiryOverride = firstDefinedValue(overrides, [
    ['sessionReset', 'idleExpiryMinutes'],
    ['session_reset', 'idle_expiry_minutes']
  ]);
  const sessionMemoryEnabledOverride = firstDefinedValue(overrides, [
    ['sessionMemory', 'enabled'],
    ['session_memory', 'enabled']
  ]);
  const sessionMemoryMessageCountOverride = firstDefinedValue(overrides, [
    ['sessionMemory', 'messageCount'],
    ['session_memory', 'message_count']
  ]);
  const episodicReadStrategyOverride = firstDefinedValue(overrides, [
    ['episodicNotes', 'readStrategy'],
    ['episodic_notes', 'read_strategy']
  ]);
  const episodicCustomWindowDaysOverride = firstDefinedValue(overrides, [
    ['episodicNotes', 'customWindowDays'],
    ['episodic_notes', 'custom_window_days']
  ]);

  return {
    planTier: normalizedPlanTier,
    timezone: normalizeTimezone(timezone),
    dayBoundaryEnabled: normalizeBoolean(
      dayBoundaryOverride,
      normalizeBoolean(
        planDefaults.dayBoundaryEnabled,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.dayBoundaryEnabled
      )
    ),
    idleExpiryMinutes: normalizeNonNegativeInteger(
      idleExpiryOverride,
      normalizeNonNegativeInteger(
        planDefaults.idleExpiryMinutes,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.idleExpiryMinutes
      )
    ),
    sessionMemoryEnabled: normalizeBoolean(
      sessionMemoryEnabledOverride,
      normalizeBoolean(
        planDefaults.sessionMemoryEnabled,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.sessionMemoryEnabled
      )
    ),
    sessionMemoryMessageCount: normalizeNonNegativeInteger(
      sessionMemoryMessageCountOverride,
      normalizeNonNegativeInteger(
        planDefaults.sessionMemoryMessageCount,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.sessionMemoryMessageCount
      )
    ),
    episodicReadStrategy: normalizeReadStrategy(
      episodicReadStrategyOverride,
      normalizeReadStrategy(
        planDefaults.episodicReadStrategy,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.episodicReadStrategy
      )
    ),
    episodicCustomWindowDays: normalizeNonNegativeInteger(
      episodicCustomWindowDaysOverride,
      normalizeNonNegativeInteger(
        planDefaults.episodicCustomWindowDays,
        GLOBAL_SESSION_CONTINUITY_DEFAULTS.episodicCustomWindowDays
      )
    )
  };
}

function buildEffectiveSessionResetPolicy(inputs) {
  const continuityPolicy = buildEffectiveSessionContinuityPolicy(inputs);

  return {
    planTier: continuityPolicy.planTier,
    timezone: continuityPolicy.timezone,
    dayBoundaryEnabled: continuityPolicy.dayBoundaryEnabled,
    idleExpiryMinutes: continuityPolicy.idleExpiryMinutes
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
  const [settingsResult, profileResult] = await Promise.all([
    supabase
      .from('user_plan_settings')
      .select('plan_tier, policy_overrides_json')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle()
  ]);

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  if (profileResult.error) {
    throw profileResult.error;
  }

  return {
    planTier: settingsResult.data ? settingsResult.data.plan_tier : GLOBAL_SESSION_CONTINUITY_DEFAULTS.planTier,
    policyOverrides: settingsResult.data ? settingsResult.data.policy_overrides_json : {},
    timezone: profileResult.data ? profileResult.data.timezone : GLOBAL_SESSION_CONTINUITY_DEFAULTS.timezone
  };
}

async function resolveSessionContinuityPolicy(userId, options = {}) {
  const cacheTtlSec = Math.max(0, env.sessionResetPolicyCacheTtlSec || 0);
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
      console.warn('Session reset policy cache read failed:', error.message);
    }
  }

  const inputs = await loadPolicyInputs(userId);
  const policy = buildEffectiveSessionContinuityPolicy(inputs);

  if (!skipCache) {
    try {
      await writeCachedPolicy(cacheKey, policy, cacheTtlSec);
    } catch (error) {
      console.warn('Session reset policy cache write failed:', error.message);
    }
  }

  return {
    ...policy,
    cacheHit: false
  };
}

async function resolveSessionResetPolicy(userId, options = {}) {
  const policy = await resolveSessionContinuityPolicy(userId, options);

  return {
    planTier: policy.planTier,
    timezone: policy.timezone,
    dayBoundaryEnabled: policy.dayBoundaryEnabled,
    idleExpiryMinutes: policy.idleExpiryMinutes,
    cacheHit: policy.cacheHit
  };
}

module.exports = {
  buildEffectiveSessionContinuityPolicy,
  buildEffectiveSessionResetPolicy,
  resolveSessionContinuityPolicy,
  resolveSessionResetPolicy
};
