const { getRedisConnection } = require('./connection');

const RESERVE_CONCURRENCY_SCRIPT = `
local member = ARGV[1]
local now_ms = tonumber(ARGV[2])
local expires_at_ms = tonumber(ARGV[3])
local scope_count = tonumber(ARGV[4])

for i = 1, scope_count do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now_ms)
end

for i = 1, scope_count do
  local limit = tonumber(ARGV[4 + i])
  local existing_score = redis.call('ZSCORE', KEYS[i], member)
  local current_count = redis.call('ZCARD', KEYS[i])

  if (not existing_score) and limit and limit > 0 and current_count >= limit then
    return { 0, tostring(i), tostring(limit), tostring(current_count) }
  end
end

local ttl_ms = math.max(1000, expires_at_ms - now_ms + 1000)

for i = 1, scope_count do
  redis.call('ZADD', KEYS[i], expires_at_ms, member)
  redis.call('PEXPIRE', KEYS[i], ttl_ms)
end

return { 1, tostring(ttl_ms) }
`;

const RELEASE_CONCURRENCY_SCRIPT = `
local member = ARGV[1]
local scope_count = tonumber(ARGV[2])

for i = 1, scope_count do
  redis.call('ZREM', KEYS[i], member)
end

return { 1 }
`;

function normalizeScopeList(scopes) {
  return (scopes || []).filter(scope => (
    scope
    && scope.key
    && Number.isFinite(scope.limit)
    && scope.limit > 0
    && scope.scope
  ));
}

async function reserveConcurrencyLease({
  member,
  scopes,
  ttlMs,
  nowMs = Date.now()
}) {
  if (!member || !String(member).trim()) {
    throw new Error('Concurrency lease member is required');
  }

  const normalizedScopes = normalizeScopeList(scopes);
  if (normalizedScopes.length === 0) {
    return {
      allowed: true,
      enforced: false,
      rejectedScope: null
    };
  }

  const redis = getRedisConnection();
  if (!redis) {
    return {
      allowed: true,
      enforced: false,
      rejectedScope: null
    };
  }

  const result = await redis.eval(
    RESERVE_CONCURRENCY_SCRIPT,
    normalizedScopes.length,
    ...normalizedScopes.map(scope => scope.key),
    String(member),
    String(Math.max(0, Math.floor(nowMs))),
    String(Math.max(1000, Math.floor(ttlMs))),
    String(normalizedScopes.length),
    ...normalizedScopes.map(scope => String(scope.limit))
  );

  if (Number(result[0]) === 1) {
    return {
      allowed: true,
      enforced: true,
      rejectedScope: null,
      ttlMs: Number(result[1]) || null
    };
  }

  const rejectedIndex = Math.max(0, Number(result[1]) - 1);

  return {
    allowed: false,
    enforced: true,
    rejectedScope: normalizedScopes[rejectedIndex] || null,
    activeCount: Number(result[3]) || null
  };
}

async function releaseConcurrencyLease({
  member,
  scopes
}) {
  if (!member || !String(member).trim()) {
    return;
  }

  const normalizedScopes = normalizeScopeList(scopes);
  if (normalizedScopes.length === 0) {
    return;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return;
  }

  await redis.eval(
    RELEASE_CONCURRENCY_SCRIPT,
    normalizedScopes.length,
    ...normalizedScopes.map(scope => scope.key),
    String(member),
    String(normalizedScopes.length)
  );
}

module.exports = {
  reserveConcurrencyLease,
  releaseConcurrencyLease
};
