/**
 * File overview:
 * Implements runtime service logic for session mutation lock.
 *
 * Main functions in this file:
 * - buildSessionMutationLockKey: Builds a Session mutation lock key used by this file.
 * - buildWorkoutMutationLockKey: Builds a workout-scoped mutation lock key used by this file.
 * - acquireSessionMutationLock: Handles Acquire session mutation lock for session-mutation-lock.service.js.
 * - acquireWorkoutMutationLock: Handles Acquire workout mutation lock for session-mutation-lock.service.js.
 * - renewSessionMutationLock: Handles Renew session mutation lock for session-mutation-lock.service.js.
 * - releaseSessionMutationLock: Releases Session mutation lock once it is safe to do so.
 */

const { randomUUID } = require('node:crypto');

const { getRedisConnection } = require('../../infra/redis/connection');
const { sha256Hex } = require('../../shared/hash');

const ACQUIRE_LOCK_SCRIPT = `
local key = KEYS[1]
local token = ARGV[1]
local ttl_ms = tonumber(ARGV[2])

if redis.call('SET', key, token, 'NX', 'PX', ttl_ms) then
  return { 1 }
end

return { 0, redis.call('GET', key) }
`;

const RENEW_LOCK_SCRIPT = `
local key = KEYS[1]
local token = ARGV[1]
local ttl_ms = tonumber(ARGV[2])

if redis.call('GET', key) == token then
  redis.call('PEXPIRE', key, ttl_ms)
  return { 1 }
end

return { 0 }
`;

const RELEASE_LOCK_SCRIPT = `
local key = KEYS[1]
local token = ARGV[1]

if redis.call('GET', key) == token then
  redis.call('DEL', key)
  return { 1 }
end

return { 0 }
`;

const SESSION_MUTATION_LOCK_TTL_MS = 5 * 60 * 1000;
const WORKOUT_MUTATION_LOCK_TTL_MS = 15 * 1000;

class SessionMutationLockBusyError extends Error {
  constructor(message = 'Another worker is already mutating this session') {
    super(message);
    this.name = 'SessionMutationLockBusyError';
    this.code = 'SESSION_MUTATION_LOCK_BUSY';
  }
}

class WorkoutMutationLockBusyError extends Error {
  constructor(message = 'Another request is already mutating this workout') {
    super(message);
    this.name = 'WorkoutMutationLockBusyError';
    this.code = 'WORKOUT_MUTATION_LOCK_BUSY';
  }
}

function buildMutationLockKey(namespace, identity) {
  return `lock:${namespace}:${sha256Hex(identity)}`;
}

/**
 * Builds a Session mutation lock key used by this file.
 */
function buildSessionMutationLockKey({ userId, sessionKey, sessionId }) {
  return buildMutationLockKey('session-mutation', `${userId}:${sessionKey}:${sessionId}`);
}

function buildWorkoutMutationLockKey({ userId, workoutSessionId }) {
  return buildMutationLockKey('workout-mutation', `${userId}:${workoutSessionId}`);
}

async function acquireMutationLock({ key, ttlMs }) {
  const redis = getRedisConnection();

  if (!redis) {
    return {
      acquired: true,
      enforced: false,
      key: null,
      token: null,
      ttlMs
    };
  }

  const token = randomUUID();
  const result = await redis.eval(
    ACQUIRE_LOCK_SCRIPT,
    1,
    key,
    token,
    String(ttlMs)
  );

  return {
    acquired: Number(result[0]) === 1,
    enforced: true,
    key,
    token,
    ttlMs
  };
}

/**
 * Handles Acquire session mutation lock for session-mutation-lock.service.js.
 */
async function acquireSessionMutationLock({
  userId,
  sessionKey,
  sessionId,
  ttlMs = SESSION_MUTATION_LOCK_TTL_MS
}) {
  return acquireMutationLock({
    key: buildSessionMutationLockKey({
      userId,
      sessionKey,
      sessionId
    }),
    ttlMs
  });
}

async function acquireWorkoutMutationLock({
  userId,
  workoutSessionId,
  ttlMs = WORKOUT_MUTATION_LOCK_TTL_MS
}) {
  return acquireMutationLock({
    key: buildWorkoutMutationLockKey({
      userId,
      workoutSessionId
    }),
    ttlMs
  });
}

/**
 * Handles Renew session mutation lock for session-mutation-lock.service.js.
 */
async function renewSessionMutationLock(lock) {
  if (!lock || !lock.enforced || !lock.key || !lock.token) {
    return true;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return true;
  }

  const result = await redis.eval(
    RENEW_LOCK_SCRIPT,
    1,
    lock.key,
    lock.token,
    String(lock.ttlMs || SESSION_MUTATION_LOCK_TTL_MS)
  );

  return Number(result[0]) === 1;
}

/**
 * Releases Session mutation lock once it is safe to do so.
 */
async function releaseSessionMutationLock(lock) {
  if (!lock || !lock.enforced || !lock.key || !lock.token) {
    return;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return;
  }

  await redis.eval(
    RELEASE_LOCK_SCRIPT,
    1,
    lock.key,
    lock.token
  );
}

module.exports = {
  SessionMutationLockBusyError,
  WorkoutMutationLockBusyError,
  acquireSessionMutationLock,
  acquireWorkoutMutationLock,
  renewSessionMutationLock,
  releaseSessionMutationLock
};
