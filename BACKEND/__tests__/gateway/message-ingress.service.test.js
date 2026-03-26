const mockEnqueueAgentRunTurn = jest.fn();
const mockLookupIdempotencyResponse = jest.fn();
const mockPersistInboundMessage = jest.fn();
const mockGetRunById = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockResolveRetrievalPolicy = jest.fn();
const mockResolveRateLimitPolicy = jest.fn();
const mockResolveConcurrencyPolicy = jest.fn();
const mockEnqueueSessionMemoryFlushIfNeeded = jest.fn();
const mockEnqueueSessionIndexSyncIfNeeded = jest.fn();
const mockAdmitMessageRequest = jest.fn();
const mockReleaseMessageRateLimitReservation = jest.fn();
const mockAdmitActiveRun = jest.fn();
const mockReleaseActiveRunReservation = jest.fn();
const mockBindRunConcurrencyReservation = jest.fn();

jest.mock('../../src/infra/queue/agent.queue', () => ({
  enqueueAgentRunTurn: mockEnqueueAgentRunTurn
}));

jest.mock('../../src/runtime/services/idempotency.service', () => ({
  requireIdempotencyKey: jest.fn(() => 'idem-123'),
  lookupIdempotencyResponse: mockLookupIdempotencyResponse
}));

jest.mock('../../src/runtime/services/gateway-ingest.service', () => ({
  persistInboundMessage: mockPersistInboundMessage
}));

jest.mock('../../src/runtime/services/run-state.service', () => ({
  getRunById: mockGetRunById
}));

jest.mock('../../src/runtime/services/session-reset-policy.service', () => ({
  resolveSessionContinuityPolicy: mockResolveSessionContinuityPolicy
}));

jest.mock('../../src/runtime/services/retrieval-policy.service', () => ({
  resolveRetrievalPolicy: mockResolveRetrievalPolicy
}));

jest.mock('../../src/runtime/services/rate-limit-policy.service', () => ({
  resolveRateLimitPolicy: mockResolveRateLimitPolicy
}));

jest.mock('../../src/runtime/services/concurrency-policy.service', () => ({
  resolveConcurrencyPolicy: mockResolveConcurrencyPolicy
}));

jest.mock('../../src/runtime/services/session-memory-queue.service', () => ({
  enqueueSessionMemoryFlushIfNeeded: mockEnqueueSessionMemoryFlushIfNeeded
}));

jest.mock('../../src/runtime/services/indexing-queue.service', () => ({
  enqueueSessionIndexSyncIfNeeded: mockEnqueueSessionIndexSyncIfNeeded
}));

jest.mock('../../src/gateway/services/message-rate-limit.service', () => ({
  admitMessageRequest: mockAdmitMessageRequest,
  releaseMessageRateLimitReservation: mockReleaseMessageRateLimitReservation
}));

jest.mock('../../src/gateway/services/concurrency-admission.service', () => ({
  admitActiveRun: mockAdmitActiveRun,
  releaseActiveRunReservation: mockReleaseActiveRunReservation,
  bindRunConcurrencyReservation: mockBindRunConcurrencyReservation
}));

const { processInboundMessage } = require('../../src/gateway/services/message-ingress.service');

describe('processInboundMessage admission integration', () => {
  const activeRunReservation = {
    member: 'run-reservation:abc',
    scopes: [
      {
        key: 'conc:runs:user:dXNlci0xMjM',
        limit: 20,
        scope: 'concurrency_active_runs'
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveSessionContinuityPolicy.mockResolvedValue({
      timezone: 'America/New_York',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240,
      cacheHit: false
    });
    mockResolveRetrievalPolicy.mockResolvedValue({
      queryBackend: 'redis_hybrid',
      cacheHit: true
    });
    mockResolveRateLimitPolicy.mockResolvedValue({
      messages: {
        capacity: 100,
        refillPerSecond: 5,
        deviceCapacity: 100,
        deviceRefillPerSecond: 5,
        ipCapacity: 100,
        ipRefillPerSecond: 5
      },
      retryHintSeconds: 30,
      cacheHit: true
    });
    mockResolveConcurrencyPolicy.mockResolvedValue({
      maxActiveRuns: 20,
      maxActiveStreams: 20,
      maxActiveStreamsPerDevice: 20,
      retryHintSeconds: 30,
      cacheHit: false
    });
    mockAdmitMessageRequest.mockResolvedValue({
      reservation: {
        scopes: [
          {
            key: 'rl:user',
            capacity: 100,
            refillPerSecond: 5,
            requestedTokens: 1
          }
        ]
      }
    });
    mockAdmitActiveRun.mockResolvedValue(activeRunReservation);
    mockEnqueueSessionMemoryFlushIfNeeded.mockResolvedValue();
    mockEnqueueSessionIndexSyncIfNeeded.mockResolvedValue();
    mockReleaseMessageRateLimitReservation.mockResolvedValue();
    mockReleaseActiveRunReservation.mockResolvedValue();
    mockBindRunConcurrencyReservation.mockResolvedValue();
  });

  it('bypasses rate limiting and concurrency admission for stored idempotent replays', async () => {
    mockLookupIdempotencyResponse.mockResolvedValue({
      status: 'accepted',
      sessionKey: 'session-key',
      sessionId: 'session-id',
      runId: 'run-123',
      replayed: true
    });
    mockGetRunById.mockResolvedValue({
      status: 'succeeded'
    });

    const result = await processInboundMessage({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        message: 'hello',
        triggerType: 'user.message'
      },
      ipAddress: '127.0.0.1'
    });

    expect(mockAdmitMessageRequest).not.toHaveBeenCalled();
    expect(mockAdmitActiveRun).not.toHaveBeenCalled();
    expect(mockPersistInboundMessage).not.toHaveBeenCalled();
    expect(result.debug.rateLimitBypassedForReplay).toBe(true);
    expect(result.debug.concurrencyGateBypassedForReplay).toBe(true);
    expect(result.jobId).toBeNull();
  });

  it('refunds rate-limit tokens and releases the active-run reservation when the db replay path wins', async () => {
    mockLookupIdempotencyResponse.mockResolvedValue(null);
    mockPersistInboundMessage.mockResolvedValue({
      status: 'accepted',
      sessionKey: 'session-key',
      sessionId: 'session-id',
      runId: 'run-123',
      replayed: true
    });
    mockGetRunById.mockResolvedValue({
      status: 'queued'
    });
    mockEnqueueAgentRunTurn.mockResolvedValue({
      jobId: 'job-123'
    });

    const result = await processInboundMessage({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        message: 'hello',
        triggerType: 'user.message'
      },
      ipAddress: '127.0.0.1'
    });

    expect(mockAdmitMessageRequest).toHaveBeenCalled();
    expect(mockAdmitActiveRun).toHaveBeenCalled();
    expect(mockReleaseMessageRateLimitReservation).toHaveBeenCalledTimes(1);
    expect(mockReleaseActiveRunReservation).toHaveBeenCalledWith(activeRunReservation);
    expect(mockBindRunConcurrencyReservation).not.toHaveBeenCalled();
    expect(result.debug.rateLimitTokensRefunded).toBe(true);
    expect(result.jobId).toBe('job-123');
  });

  it('refunds tokens and releases the active-run reservation when message ingest fails', async () => {
    mockLookupIdempotencyResponse.mockResolvedValue(null);
    mockPersistInboundMessage.mockRejectedValue(new Error('ingest failed'));

    await expect(processInboundMessage({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        message: 'hello',
        triggerType: 'user.message'
      },
      ipAddress: '127.0.0.1'
    })).rejects.toThrow('ingest failed');

    expect(mockReleaseMessageRateLimitReservation).toHaveBeenCalledTimes(1);
    expect(mockReleaseActiveRunReservation).toHaveBeenCalledWith(activeRunReservation);
    expect(mockEnqueueAgentRunTurn).not.toHaveBeenCalled();
  });

  it('refunds rate-limit tokens when concurrency admission is denied after rate limiting', async () => {
    mockLookupIdempotencyResponse.mockResolvedValue(null);
    mockAdmitActiveRun.mockRejectedValue(Object.assign(new Error('Concurrency admission limit exceeded'), {
      statusCode: 429
    }));

    await expect(processInboundMessage({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        message: 'hello',
        triggerType: 'user.message'
      },
      ipAddress: '127.0.0.1'
    })).rejects.toMatchObject({
      statusCode: 429
    });

    expect(mockReleaseMessageRateLimitReservation).toHaveBeenCalledTimes(1);
    expect(mockReleaseActiveRunReservation).not.toHaveBeenCalled();
    expect(mockPersistInboundMessage).not.toHaveBeenCalled();
  });

  it('binds the active-run reservation to the persisted run id on first acceptance', async () => {
    mockLookupIdempotencyResponse.mockResolvedValue(null);
    mockPersistInboundMessage.mockResolvedValue({
      status: 'accepted',
      sessionKey: 'session-key',
      sessionId: 'session-id',
      runId: 'run-123',
      replayed: false
    });
    mockEnqueueAgentRunTurn.mockResolvedValue({
      jobId: 'job-123'
    });

    const result = await processInboundMessage({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        message: 'hello',
        triggerType: 'user.message'
      },
      ipAddress: '127.0.0.1'
    });

    expect(mockBindRunConcurrencyReservation).toHaveBeenCalledWith({
      runId: 'run-123',
      reservation: activeRunReservation
    });
    expect(result.debug.concurrencyPolicyCacheHit).toBe(false);
    expect(result.jobId).toBe('job-123');
  });
});
