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

function normalizeHeaderValue(value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  return String(value).trim();
}

function normalizeDeviceId(headers = {}) {
  return normalizeHeaderValue(headers['x-device-id'] || headers['x-client-device-id']);
}

function encodeScopeIdentifier(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

function buildActiveRunScope(userId) {
  return {
    scope: 'concurrency_active_runs',
    key: `conc:runs:user:${encodeScopeIdentifier(userId)}`
  };
}

function buildActiveStreamUserScope(userId) {
  return {
    scope: 'concurrency_active_streams',
    key: `conc:streams:user:${encodeScopeIdentifier(userId)}`
  };
}

function buildActiveStreamDeviceScope(userId, deviceId) {
  return {
    scope: 'concurrency_active_streams_per_device',
    key: `conc:streams:device:${encodeScopeIdentifier(userId)}:${encodeScopeIdentifier(deviceId)}`
  };
}

function buildRunReservationMember({ userId, idempotencyKey }) {
  return `run-reservation:${sha256Hex(`${userId}:${idempotencyKey}`)}`;
}

function buildRunReservationMappingKey(runId) {
  return `conc:run-member:${runId}`;
}

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

async function releaseActiveRunReservation(reservation) {
  if (!reservation) {
    return;
  }

  await releaseConcurrencyLease({
    member: reservation.member,
    scopes: reservation.scopes
  });
}

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
