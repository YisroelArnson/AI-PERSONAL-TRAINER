/**
 * File overview:
 * Implements the concurrency admission service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - normalizeHeaderValue: Normalizes Header value into the format this file expects.
 * - normalizeDeviceId: Normalizes Device ID into the format this file expects.
 * - encodeScopeIdentifier: Encodes Scope identifier for transport or storage.
 * - buildActiveRunScope: Builds an Active run scope used by this file.
 * - buildActiveStreamUserScope: Builds an Active stream user scope used by this file.
 * - buildActiveStreamDeviceScope: Builds an Active stream device scope used by this file.
 * - buildRunReservationMember: Builds a Run reservation member used by this file.
 * - buildRunReservationMappingKey: Builds a Run reservation mapping key used by this file.
 * - throwConcurrency429: Handles Throw concurrency429 for concurrency-admission.service.js.
 * - admitActiveRun: Admits Active run when the request is allowed to proceed.
 * - releaseActiveRunReservation: Releases Active run reservation once it is safe to do so.
 * - bindRunConcurrencyReservation: Binds Run concurrency reservation together for later lookup.
 * - refreshActiveRunLease: Refreshes Active run lease so it stays current.
 * - releaseActiveRunLease: Releases Active run lease once it is safe to do so.
 * - admitActiveStream: Admits Active stream when the request is allowed to proceed.
 * - refreshActiveStreamLease: Refreshes Active stream lease so it stays current.
 * - releaseActiveStreamLease: Releases Active stream lease once it is safe to do so.
 */

const { randomUUID } = require('node:crypto');

const { getRedisConnection } = require('../../infra/redis/connection');
const {
  reserveConcurrencyLease,
  releaseConcurrencyLease
} = require('../../infra/redis/concurrency-leases');
const { tooManyRequests } = require('../../shared/errors');
const { sha256Hex } = require('../../shared/hash');

const ACTIVE_RUN_LEASE_TTL_MS = 15 * 60 * 1000;
const ACTIVE_STREAM_LEASE_TTL_MS = 45 * 1000;
const RUN_MEMBER_MAPPING_TTL_SEC = Math.ceil(ACTIVE_RUN_LEASE_TTL_MS / 1000);

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
 * Encodes Scope identifier for transport or storage.
 */
function encodeScopeIdentifier(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

/**
 * Builds an Active run scope used by this file.
 */
function buildActiveRunScope(userId) {
  return {
    scope: 'concurrency_active_runs',
    key: `conc:runs:user:${encodeScopeIdentifier(userId)}`
  };
}

/**
 * Builds an Active stream user scope used by this file.
 */
function buildActiveStreamUserScope(userId) {
  return {
    scope: 'concurrency_active_streams',
    key: `conc:streams:user:${encodeScopeIdentifier(userId)}`
  };
}

/**
 * Builds an Active stream device scope used by this file.
 */
function buildActiveStreamDeviceScope(userId, deviceId) {
  return {
    scope: 'concurrency_active_streams_per_device',
    key: `conc:streams:device:${encodeScopeIdentifier(userId)}:${encodeScopeIdentifier(deviceId)}`
  };
}

/**
 * Builds a Run reservation member used by this file.
 */
function buildRunReservationMember({ userId, idempotencyKey }) {
  return `run-reservation:${sha256Hex(`${userId}:${idempotencyKey}`)}`;
}

/**
 * Builds a Run reservation mapping key used by this file.
 */
function buildRunReservationMappingKey(runId) {
  return `conc:run-member:${runId}`;
}

/**
 * Handles Throw concurrency429 for concurrency-admission.service.js.
 */
async function throwConcurrency429({ rejectedScope, retryHintSeconds, route, activeCount = null }) {
  throw tooManyRequests('Concurrency admission limit exceeded', {
    scope: rejectedScope.scope,
    route,
    retry_after_seconds: retryHintSeconds,
    limit: {
      max_active: rejectedScope.limit
    },
    ...(activeCount !== null ? { active_count: activeCount } : {}),
    enforced_by: 'redis_concurrency_lease'
  });
}

/**
 * Admits Active run when the request is allowed to proceed.
 */
async function admitActiveRun({
  userId,
  idempotencyKey,
  concurrencyPolicy,
  route = '/v1/messages'
}) {
  const reservation = {
    member: buildRunReservationMember({
      userId,
      idempotencyKey
    }),
    scopes: [
      {
        ...buildActiveRunScope(userId),
        limit: concurrencyPolicy.maxActiveRuns
      }
    ],
    ttlMs: ACTIVE_RUN_LEASE_TTL_MS
  };
  const decision = await reserveConcurrencyLease({
    member: reservation.member,
    scopes: reservation.scopes,
    ttlMs: reservation.ttlMs
  });

  if (!decision.allowed) {
    await throwConcurrency429({
      rejectedScope: decision.rejectedScope,
      retryHintSeconds: concurrencyPolicy.retryHintSeconds,
      route,
      activeCount: decision.activeCount
    });
  }

  return {
    ...reservation,
    enforced: decision.enforced
  };
}

/**
 * Releases Active run reservation once it is safe to do so.
 */
async function releaseActiveRunReservation(reservation) {
  if (!reservation) {
    return;
  }

  await releaseConcurrencyLease({
    member: reservation.member,
    scopes: reservation.scopes
  });
}

/**
 * Binds Run concurrency reservation together for later lookup.
 */
async function bindRunConcurrencyReservation({ runId, reservation }) {
  if (!runId || !reservation || !reservation.member) {
    return;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return;
  }

  await redis.set(
    buildRunReservationMappingKey(runId),
    reservation.member,
    'EX',
    RUN_MEMBER_MAPPING_TTL_SEC
  );
}

/**
 * Refreshes Active run lease so it stays current.
 */
async function refreshActiveRunLease({ runId, userId, concurrencyPolicy }) {
  if (!runId || !userId) {
    return {
      refreshed: false,
      enforced: false
    };
  }

  const redis = getRedisConnection();
  if (!redis) {
    return {
      refreshed: false,
      enforced: false
    };
  }

  const member = await redis.get(buildRunReservationMappingKey(runId));
  if (!member) {
    return {
      refreshed: false,
      enforced: true
    };
  }

  const scopes = [
    {
      ...buildActiveRunScope(userId),
      limit: concurrencyPolicy.maxActiveRuns
    }
  ];

  const decision = await reserveConcurrencyLease({
    member,
    scopes,
    ttlMs: ACTIVE_RUN_LEASE_TTL_MS
  });

  if (decision.allowed) {
    await redis.expire(buildRunReservationMappingKey(runId), RUN_MEMBER_MAPPING_TTL_SEC);
  }

  return {
    refreshed: decision.allowed,
    enforced: decision.enforced
  };
}

/**
 * Releases Active run lease once it is safe to do so.
 */
async function releaseActiveRunLease({ runId, userId }) {
  if (!runId || !userId) {
    return;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return;
  }

  const mappingKey = buildRunReservationMappingKey(runId);
  const member = await redis.get(mappingKey);

  if (!member) {
    return;
  }

  await releaseConcurrencyLease({
    member,
    scopes: [
      {
        ...buildActiveRunScope(userId),
        limit: 1
      }
    ]
  });

  await redis.del(mappingKey);
}

/**
 * Admits Active stream when the request is allowed to proceed.
 */
async function admitActiveStream({
  userId,
  headers,
  concurrencyPolicy,
  route = '/v1/runs/:runId/stream'
}) {
  const deviceId = normalizeDeviceId(headers);
  const lease = {
    member: `stream:${randomUUID()}`,
    userId,
    deviceId,
    scopes: [
      {
        ...buildActiveStreamUserScope(userId),
        limit: concurrencyPolicy.maxActiveStreams
      }
    ],
    ttlMs: ACTIVE_STREAM_LEASE_TTL_MS
  };

  if (deviceId && concurrencyPolicy.maxActiveStreamsPerDevice > 0) {
    lease.scopes.push({
      ...buildActiveStreamDeviceScope(userId, deviceId),
      limit: concurrencyPolicy.maxActiveStreamsPerDevice
    });
  }

  const decision = await reserveConcurrencyLease({
    member: lease.member,
    scopes: lease.scopes,
    ttlMs: lease.ttlMs
  });

  if (!decision.allowed) {
    await throwConcurrency429({
      rejectedScope: decision.rejectedScope,
      retryHintSeconds: concurrencyPolicy.retryHintSeconds,
      route,
      activeCount: decision.activeCount
    });
  }

  return lease;
}

/**
 * Refreshes Active stream lease so it stays current.
 */
async function refreshActiveStreamLease({ lease, concurrencyPolicy }) {
  if (!lease) {
    return {
      refreshed: false,
      enforced: false
    };
  }

  const refreshedScopes = lease.scopes.map(scope => {
    if (scope.scope === 'concurrency_active_streams') {
      return {
        ...scope,
        limit: concurrencyPolicy.maxActiveStreams
      };
    }

    return {
      ...scope,
      limit: concurrencyPolicy.maxActiveStreamsPerDevice
    };
  });
  const decision = await reserveConcurrencyLease({
    member: lease.member,
    scopes: refreshedScopes,
    ttlMs: lease.ttlMs
  });

  return {
    refreshed: decision.allowed,
    enforced: decision.enforced
  };
}

/**
 * Releases Active stream lease once it is safe to do so.
 */
async function releaseActiveStreamLease(lease) {
  if (!lease) {
    return;
  }

  await releaseConcurrencyLease({
    member: lease.member,
    scopes: lease.scopes
  });
}

module.exports = {
  admitActiveRun,
  releaseActiveRunReservation,
  bindRunConcurrencyReservation,
  refreshActiveRunLease,
  releaseActiveRunLease,
  admitActiveStream,
  refreshActiveStreamLease,
  releaseActiveStreamLease
};
