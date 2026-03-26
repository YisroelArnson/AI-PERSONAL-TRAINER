const { getRedisConnection } = require('./connection');

const TAKE_TOKENS_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_second = tonumber(ARGV[2])
local requested_tokens = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

if (not capacity) or capacity <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_CAPACITY')
end

if (not refill_per_second) or refill_per_second <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_REFILL_RATE')
end

if (not requested_tokens) or requested_tokens <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_REQUEST_TOKENS')
end

if not now_ms then
  now_ms = 0
end

local state = redis.call('HMGET', key, 'tokens', 'updated_at_ms')
local tokens = tonumber(state[1])
local updated_at_ms = tonumber(state[2])

if tokens == nil then
  tokens = capacity
end

if updated_at_ms == nil or updated_at_ms > now_ms then
  updated_at_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - updated_at_ms)
if elapsed_ms > 0 then
  tokens = math.min(capacity, tokens + ((elapsed_ms / 1000) * refill_per_second))
end

local allowed = 0
local retry_after_ms = 0
if tokens >= requested_tokens then
  tokens = tokens - requested_tokens
  allowed = 1
else
  retry_after_ms = math.ceil(((requested_tokens - tokens) / refill_per_second) * 1000)
end

local ttl_ms = math.max(1000, math.ceil(((capacity - tokens) / refill_per_second) * 1000) + 1000)

redis.call('HSET', key, 'tokens', tostring(tokens), 'updated_at_ms', tostring(now_ms))
redis.call('PEXPIRE', key, ttl_ms)

return { allowed, tostring(tokens), tostring(retry_after_ms), tostring(ttl_ms) }
`;

const REFUND_TOKENS_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_second = tonumber(ARGV[2])
local refunded_tokens = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

if (not capacity) or capacity <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_CAPACITY')
end

if (not refill_per_second) or refill_per_second <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_REFILL_RATE')
end

if (not refunded_tokens) or refunded_tokens <= 0 then
  return redis.error_reply('TOKEN_BUCKET_INVALID_REFUND_TOKENS')
end

if not now_ms then
  now_ms = 0
end

local state = redis.call('HMGET', key, 'tokens', 'updated_at_ms')
local tokens = tonumber(state[1])
local updated_at_ms = tonumber(state[2])

if tokens == nil then
  tokens = capacity
end

if updated_at_ms == nil or updated_at_ms > now_ms then
  updated_at_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - updated_at_ms)
if elapsed_ms > 0 then
  tokens = math.min(capacity, tokens + ((elapsed_ms / 1000) * refill_per_second))
end

tokens = math.min(capacity, tokens + refunded_tokens)

local ttl_ms = math.max(1000, math.ceil(((capacity - tokens) / refill_per_second) * 1000) + 1000)

redis.call('HSET', key, 'tokens', tostring(tokens), 'updated_at_ms', tostring(now_ms))
redis.call('PEXPIRE', key, ttl_ms)

return { tostring(tokens), tostring(ttl_ms) }
`;

function assertPositiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function parseWholeNumber(value, fallback = 0) {
  const coerced = Number(value);

  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(0, Math.ceil(coerced));
}

function parseTokenCount(value, fallback = 0) {
  const coerced = Number(value);

  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(0, coerced);
}

async function takeTokenBucketTokens({
  key,
  capacity,
  refillPerSecond,
  requestedTokens = 1,
  nowMs = Date.now()
}) {
  if (!key || !String(key).trim()) {
    throw new Error('Token bucket key is required');
  }

  assertPositiveFinite(capacity, 'Token bucket capacity');
  assertPositiveFinite(refillPerSecond, 'Token bucket refill rate');
  assertPositiveFinite(requestedTokens, 'Requested token count');

  const redis = getRedisConnection();

  if (!redis) {
    return {
      allowed: true,
      enforced: false,
      tokensRemaining: null,
      retryAfterSeconds: 0,
      retryAfterMs: 0,
      ttlMs: null
    };
  }

  const [allowedRaw, tokensRaw, retryAfterMsRaw, ttlMsRaw] = await redis.eval(
    TAKE_TOKENS_SCRIPT,
    1,
    key,
    String(capacity),
    String(refillPerSecond),
    String(requestedTokens),
    String(Math.max(0, Math.floor(nowMs)))
  );

  const retryAfterMs = parseWholeNumber(retryAfterMsRaw, 0);

  return {
    allowed: Number(allowedRaw) === 1,
    enforced: true,
    tokensRemaining: parseTokenCount(tokensRaw, 0),
    retryAfterMs,
    retryAfterSeconds: retryAfterMs > 0 ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 0,
    ttlMs: parseWholeNumber(ttlMsRaw, 0)
  };
}

async function refundTokenBucketTokens({
  key,
  capacity,
  refillPerSecond,
  refundedTokens = 1,
  nowMs = Date.now()
}) {
  if (!key || !String(key).trim()) {
    throw new Error('Token bucket key is required');
  }

  assertPositiveFinite(capacity, 'Token bucket capacity');
  assertPositiveFinite(refillPerSecond, 'Token bucket refill rate');
  assertPositiveFinite(refundedTokens, 'Refunded token count');

  const redis = getRedisConnection();

  if (!redis) {
    return {
      enforced: false,
      refunded: false,
      tokensRemaining: null,
      ttlMs: null
    };
  }

  const [tokensRaw, ttlMsRaw] = await redis.eval(
    REFUND_TOKENS_SCRIPT,
    1,
    key,
    String(capacity),
    String(refillPerSecond),
    String(refundedTokens),
    String(Math.max(0, Math.floor(nowMs)))
  );

  return {
    enforced: true,
    refunded: true,
    tokensRemaining: parseTokenCount(tokensRaw, 0),
    ttlMs: parseWholeNumber(ttlMsRaw, 0)
  };
}

module.exports = {
  takeTokenBucketTokens,
  refundTokenBucketTokens
};
