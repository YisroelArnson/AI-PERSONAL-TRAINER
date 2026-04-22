/**
 * File overview:
 * Implements runtime service logic for session reset policy.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - buildCacheKey: Builds a Cache key used by this file.
 * - isPlainObject: Handles Is plain object for session-reset-policy.service.js.
 * - getNestedValue: Gets Nested value needed by this file.
 * - firstDefinedValue: Handles First defined value for session-reset-policy.service.js.
 * - normalizeTimezone: Normalizes Timezone into the format this file expects.
 * - normalizeBoolean: Normalizes Boolean into the format this file expects.
 * - normalizeNonNegativeInteger: Normalizes Non negative integer into the format this file expects.
 * - normalizeReadStrategy: Normalizes Read strategy into the format this file expects.
 * - buildEffectiveSessionContinuityPolicy: Builds an Effective session continuity policy used by this file.
 * - buildEffectiveSessionResetPolicy: Builds an Effective session reset policy used by this file.
 * - readInMemoryCache: Reads In memory cache from its source.
 * - writeInMemoryCache: Writes In memory cache to its destination.
 * - readCachedPolicy: Reads Cached policy from its source.
 * - writeCachedPolicy: Writes Cached policy to its destination.
 * - loadPolicyInputs: Loads Policy inputs for the surrounding workflow.
 * - resolveSessionContinuityPolicy: Resolves Session continuity policy before the next step runs.
 * - resolveSessionResetPolicy: Resolves Session reset policy before the next step runs.
 */

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
  return `session-reset-policy:user:${userId}`;
}

/**
 * Handles Is plain object for session-reset-policy.service.js.
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
 * Handles First defined value for session-reset-policy.service.js.
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
 * Normalizes Timezone into the format this file expects.
 */
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
 * Normalizes Non negative integer into the format this file expects.
 */
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

/**
 * Normalizes Read strategy into the format this file expects.
 */
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

/**
 * Builds an Effective session continuity policy used by this file.
 */
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

/**
 * Builds an Effective session reset policy used by this file.
 */
function buildEffectiveSessionResetPolicy(inputs) {
  const continuityPolicy = buildEffectiveSessionContinuityPolicy(inputs);

  return {
    planTier: continuityPolicy.planTier,
    timezone: continuityPolicy.timezone,
    dayBoundaryEnabled: continuityPolicy.dayBoundaryEnabled,
    idleExpiryMinutes: continuityPolicy.idleExpiryMinutes
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

/**
 * Resolves Session continuity policy before the next step runs.
 */
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

/**
 * Resolves Session reset policy before the next step runs.
 */
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
