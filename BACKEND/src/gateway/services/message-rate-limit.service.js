const { refundTokenBucketTokens, takeTokenBucketTokens } = require('../../infra/redis/token-bucket');
const { tooManyRequests } = require('../../shared/errors');

const MESSAGE_ROUTE = '/v1/messages';

function normalizeHeaderValue(value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  return String(value).trim();
}

function normalizeDeviceId(headers = {}) {
  return normalizeHeaderValue(headers['x-device-id'] || headers['x-client-device-id']);
}

function normalizeIpAddress(ipAddress) {
  if (Array.isArray(ipAddress)) {
    return normalizeIpAddress(ipAddress[0]);
  }

  const rawValue = normalizeHeaderValue(ipAddress);
  if (!rawValue) {
    return null;
  }

  const candidate = rawValue.split(',')[0].trim();
  return candidate.startsWith('::ffff:') ? candidate.slice('::ffff:'.length) : candidate;
}

function encodeScopeIdentifier(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

function buildScopeKey(scope, identifier) {
  return `rl:messages:${scope}:${encodeScopeIdentifier(identifier)}`;
}

function buildConfiguredScopes({ userId, headers, ipAddress, rateLimitPolicy, requestedTokens }) {
  const scopes = [
    {
      scope: 'user',
      identifier: userId,
      key: buildScopeKey('user', userId),
      capacity: rateLimitPolicy.messages.capacity,
      refillPerSecond: rateLimitPolicy.messages.refillPerSecond,
      requestedTokens
    }
  ];

  const deviceId = normalizeDeviceId(headers);
  if (
    deviceId
    && rateLimitPolicy.messages.deviceCapacity > 0
    && rateLimitPolicy.messages.deviceRefillPerSecond > 0
  ) {
    scopes.push({
      scope: 'device',
      identifier: deviceId,
      key: buildScopeKey('device', deviceId),
      capacity: rateLimitPolicy.messages.deviceCapacity,
      refillPerSecond: rateLimitPolicy.messages.deviceRefillPerSecond,
      requestedTokens
    });
  }

  const normalizedIpAddress = normalizeIpAddress(ipAddress);
  if (
    normalizedIpAddress
    && rateLimitPolicy.messages.ipCapacity > 0
    && rateLimitPolicy.messages.ipRefillPerSecond > 0
  ) {
    scopes.push({
      scope: 'ip',
      identifier: normalizedIpAddress,
      key: buildScopeKey('ip', normalizedIpAddress),
      capacity: rateLimitPolicy.messages.ipCapacity,
      refillPerSecond: rateLimitPolicy.messages.ipRefillPerSecond,
      requestedTokens
    });
  }

  return scopes;
}

async function releaseMessageRateLimitReservation(reservation) {
  if (!reservation || !Array.isArray(reservation.scopes) || reservation.scopes.length === 0) {
    return;
  }

  for (const scope of reservation.scopes) {
    await refundTokenBucketTokens({
      key: scope.key,
      capacity: scope.capacity,
      refillPerSecond: scope.refillPerSecond,
      refundedTokens: scope.requestedTokens
    });
  }
}

async function releaseReservationQuietly(reservation) {
  try {
    await releaseMessageRateLimitReservation({
      scopes: reservation
    });
  } catch (error) {
    console.warn('Unable to refund partially consumed rate-limit tokens:', error.message);
  }
}

async function admitMessageRequest({
  userId,
  headers,
  ipAddress,
  rateLimitPolicy,
  requestedTokens = 1
}) {
  const configuredScopes = buildConfiguredScopes({
    userId,
    headers,
    ipAddress,
    rateLimitPolicy,
    requestedTokens
  });
  const consumedScopes = [];
  const decisions = [];

  for (const configuredScope of configuredScopes) {
    const decision = await takeTokenBucketTokens({
      key: configuredScope.key,
      capacity: configuredScope.capacity,
      refillPerSecond: configuredScope.refillPerSecond,
      requestedTokens: configuredScope.requestedTokens
    });

    decisions.push({
      scope: configuredScope.scope,
      enforced: decision.enforced,
      allowed: decision.allowed,
      tokensRemaining: decision.tokensRemaining,
      retryAfterSeconds: decision.retryAfterSeconds
    });

    if (!decision.enforced) {
      continue;
    }

    if (!decision.allowed) {
      await releaseReservationQuietly(consumedScopes);

      throw tooManyRequests('Message admission rate limit exceeded', {
        scope: configuredScope.scope,
        route: MESSAGE_ROUTE,
        retry_after_seconds: decision.retryAfterSeconds || rateLimitPolicy.retryHintSeconds,
        limit: {
          capacity: configuredScope.capacity,
          refill_per_second: configuredScope.refillPerSecond,
          requested_tokens: configuredScope.requestedTokens
        },
        enforced_by: 'redis_token_bucket'
      });
    }

    consumedScopes.push(configuredScope);
  }

  return {
    enforced: decisions.some(decision => decision.enforced),
    decisions,
    reservation: {
      route: MESSAGE_ROUTE,
      scopes: consumedScopes
    }
  };
}

module.exports = {
  admitMessageRequest,
  releaseMessageRateLimitReservation
};
