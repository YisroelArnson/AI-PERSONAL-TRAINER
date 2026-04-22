/**
 * File overview:
 * Contains automated tests for the concurrency admission service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const mockReserveConcurrencyLease = jest.fn();
const mockReleaseConcurrencyLease = jest.fn();
const mockGetRedisConnection = jest.fn();

jest.mock('../../src/infra/redis/concurrency-leases', () => ({
  reserveConcurrencyLease: mockReserveConcurrencyLease,
  releaseConcurrencyLease: mockReleaseConcurrencyLease
}));

jest.mock('../../src/infra/redis/connection', () => ({
  getRedisConnection: mockGetRedisConnection
}));

const {
  admitActiveRun,
  bindRunConcurrencyReservation,
  refreshActiveRunLease,
  releaseActiveRunLease,
  admitActiveStream,
  releaseActiveStreamLease
} = require('../../src/gateway/services/concurrency-admission.service');

describe('concurrency admission service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('admits active runs against the per-user max', async () => {
    mockReserveConcurrencyLease.mockResolvedValue({
      allowed: true,
      enforced: true
    });

    const result = await admitActiveRun({
      userId: 'user-123',
      idempotencyKey: 'idem-123',
      concurrencyPolicy: {
        maxActiveRuns: 20,
        retryHintSeconds: 30
      }
    });

    expect(mockReserveConcurrencyLease).toHaveBeenCalledWith(expect.objectContaining({
      ttlMs: expect.any(Number),
      scopes: [
        expect.objectContaining({
          scope: 'concurrency_active_runs',
          limit: 20
        })
      ]
    }));
    expect(result).toEqual(expect.objectContaining({
      enforced: true,
      scopes: [
        expect.objectContaining({
          scope: 'concurrency_active_runs',
          limit: 20
        })
      ]
    }));
  });

  it('returns a structured 429 when the active-run cap is reached', async () => {
    mockReserveConcurrencyLease.mockResolvedValue({
      allowed: false,
      enforced: true,
      rejectedScope: {
        scope: 'concurrency_active_runs',
        limit: 20
      },
      activeCount: 20
    });

    await expect(admitActiveRun({
      userId: 'user-123',
      idempotencyKey: 'idem-123',
      concurrencyPolicy: {
        maxActiveRuns: 20,
        retryHintSeconds: 7
      }
    })).rejects.toMatchObject({
      statusCode: 429,
      details: {
        scope: 'concurrency_active_runs',
        retry_after_seconds: 7,
        active_count: 20,
        limit: {
          max_active: 20
        }
      }
    });
  });

  it('binds, refreshes, and releases active-run reservations through redis', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue('run-member-123'),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1)
    };
    mockGetRedisConnection.mockReturnValue(redis);
    mockReserveConcurrencyLease.mockResolvedValue({
      allowed: true,
      enforced: true
    });

    await bindRunConcurrencyReservation({
      runId: 'run-123',
      reservation: {
        member: 'run-member-123'
      }
    });

    const refreshed = await refreshActiveRunLease({
      runId: 'run-123',
      userId: 'user-123',
      concurrencyPolicy: {
        maxActiveRuns: 20
      }
    });

    await releaseActiveRunLease({
      runId: 'run-123',
      userId: 'user-123'
    });

    expect(redis.set).toHaveBeenCalledWith(
      'conc:run-member:run-123',
      'run-member-123',
      'EX',
      expect.any(Number)
    );
    expect(mockReserveConcurrencyLease).toHaveBeenCalledWith(expect.objectContaining({
      member: 'run-member-123',
      scopes: [
        expect.objectContaining({
          scope: 'concurrency_active_runs',
          limit: 20
        })
      ]
    }));
    expect(redis.expire).toHaveBeenCalledWith('conc:run-member:run-123', expect.any(Number));
    expect(mockReleaseConcurrencyLease).toHaveBeenCalledWith({
      member: 'run-member-123',
      scopes: [
        expect.objectContaining({
          key: expect.stringContaining('conc:runs:user:'),
          limit: 1,
          scope: 'concurrency_active_runs'
        })
      ]
    });
    expect(redis.del).toHaveBeenCalledWith('conc:run-member:run-123');
    expect(refreshed).toEqual({
      refreshed: true,
      enforced: true
    });
  });

  it('applies user and user-scoped device limits to active streams', async () => {
    mockReserveConcurrencyLease.mockResolvedValue({
      allowed: true,
      enforced: true
    });

    const lease = await admitActiveStream({
      userId: 'user-123',
      headers: {
        'x-device-id': 'device-abc'
      },
      concurrencyPolicy: {
        maxActiveStreams: 20,
        maxActiveStreamsPerDevice: 20,
        retryHintSeconds: 30
      }
    });

    expect(mockReserveConcurrencyLease).toHaveBeenCalledWith(expect.objectContaining({
      scopes: [
        expect.objectContaining({
          scope: 'concurrency_active_streams',
          limit: 20
        }),
        expect.objectContaining({
          scope: 'concurrency_active_streams_per_device',
          limit: 20,
          key: expect.stringContaining('conc:streams:device:dXNlci0xMjM')
        })
      ]
    }));

    await releaseActiveStreamLease(lease);

    expect(mockReleaseConcurrencyLease).toHaveBeenCalledWith({
      member: lease.member,
      scopes: lease.scopes
    });
  });
});
