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

class SessionMutationLockBusyError extends Error {
  constructor(message = 'Another worker is already mutating this session') {
    super(message);
    this.name = 'SessionMutationLockBusyError';
    this.code = 'SESSION_MUTATION_LOCK_BUSY';
  }
}

function buildSessionMutationLockKey({ userId, sessionKey, sessionId }) {
  return `lock:session-mutation:${sha256Hex(`${userId}:${sessionKey}:${sessionId}`)}`;
}

async function acquireSessionMutationLock({
  userId,
  sessionKey,
  sessionId,
  ttlMs = SESSION_MUTATION_LOCK_TTL_MS
}) {
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

  const key = buildSessionMutationLockKey({
    userId,
    sessionKey,
    sessionId
  });
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
  acquireSessionMutationLock,
  renewSessionMutationLock,
  releaseSessionMutationLock
};
