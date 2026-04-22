/**
 * File overview:
 * Implements the message rate limit service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - normalizeHeaderValue: Normalizes Header value into the format this file expects.
 * - normalizeDeviceId: Normalizes Device ID into the format this file expects.
 * - normalizeIpAddress: Normalizes Ip address into the format this file expects.
 * - encodeScopeIdentifier: Encodes Scope identifier for transport or storage.
 * - buildScopeKey: Builds a Scope key used by this file.
 * - buildConfiguredScopes: Builds a Configured scopes used by this file.
 * - releaseMessageRateLimitReservation: Releases Message rate limit reservation once it is safe to do so.
 * - releaseReservationQuietly: Releases Reservation quietly once it is safe to do so.
 * - admitMessageRequest: Admits Message request when the request is allowed to proceed.
 */

const { refundTokenBucketTokens, takeTokenBucketTokens } = require('../../infra/redis/token-bucket');
const { tooManyRequests } = require('../../shared/errors');

const MESSAGE_ROUTE = '/v1/messages';

/**
 * Normalizes Header value into the format this file expects.
 */
function normalizeHeaderValue(value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  return String(value).trim();
}

/**
 * Normalizes Device ID into the format this file expects.
 */
function normalizeDeviceId(headers = {}) {
  return normalizeHeaderValue(headers['x-device-id'] || headers['x-client-device-id']);
}

/**
 * Normalizes Ip address into the format this file expects.
 */
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

/**
 * Encodes Scope identifier for transport or storage.
 */
function encodeScopeIdentifier(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

/**
 * Builds a Scope key used by this file.
 */
function buildScopeKey(scope, identifier) {
  return `rl:messages:${scope}:${encodeScopeIdentifier(identifier)}`;
}

/**
 * Builds a Configured scopes used by this file.
 */
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

/**
 * Releases Message rate limit reservation once it is safe to do so.
 */
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

/**
 * Releases Reservation quietly once it is safe to do so.
 */
async function releaseReservationQuietly(reservation) {
  try {
    await releaseMessageRateLimitReservation({
      scopes: reservation
    });
  } catch (error) {
    console.warn('Unable to refund partially consumed rate-limit tokens:', error.message);
  }
}

/**
 * Admits Message request when the request is allowed to proceed.
 */
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
