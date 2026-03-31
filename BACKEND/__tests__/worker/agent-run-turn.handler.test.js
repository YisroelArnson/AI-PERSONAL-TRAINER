const mockAppendStreamEvent = jest.fn().mockResolvedValue();
const mockFlushBufferedRunStreamEvents = jest.fn().mockResolvedValue({
  flushed: true,
  eventCount: 0,
  insertedCount: 0,
  lastSeqNum: null
});
const mockRunAgentTurn = jest.fn();
const mockResolveConcurrencyPolicy = jest.fn();
const mockRefreshActiveRunLease = jest.fn().mockResolvedValue({
  refreshed: true,
  enforced: true
});
const mockReleaseActiveRunLease = jest.fn().mockResolvedValue();
const mockAcquireSessionMutationLock = jest.fn();
const mockRenewSessionMutationLock = jest.fn().mockResolvedValue(true);
const mockReleaseSessionMutationLock = jest.fn().mockResolvedValue();
const mockGetRunById = jest.fn();
const mockMarkRunRunning = jest.fn().mockResolvedValue();
const mockMarkRunSucceeded = jest.fn().mockResolvedValue();
const mockMarkRunFailed = jest.fn().mockResolvedValue();
const mockResolveEffectiveLlmSelectionForRun = jest.fn(() => ({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6'
}));

jest.mock('../../src/runtime/services/stream-events.service', () => ({
  appendStreamEvent: mockAppendStreamEvent,
  publishHotStreamEvent: mockAppendStreamEvent,
  flushBufferedRunStreamEvents: mockFlushBufferedRunStreamEvents
}));

jest.mock('../../src/runtime/agent-runtime/run-agent-turn', () => ({
  runAgentTurn: mockRunAgentTurn
}));

jest.mock('../../src/runtime/services/concurrency-policy.service', () => ({
  resolveConcurrencyPolicy: mockResolveConcurrencyPolicy
}));

jest.mock('../../src/gateway/services/concurrency-admission.service', () => ({
  refreshActiveRunLease: mockRefreshActiveRunLease,
  releaseActiveRunLease: mockReleaseActiveRunLease
}));

jest.mock('../../src/runtime/services/session-mutation-lock.service', () => ({
  SessionMutationLockBusyError: class SessionMutationLockBusyError extends Error {
    constructor(message = 'busy') {
      super(message);
      this.name = 'SessionMutationLockBusyError';
      this.code = 'SESSION_MUTATION_LOCK_BUSY';
    }
  },
  acquireSessionMutationLock: mockAcquireSessionMutationLock,
  renewSessionMutationLock: mockRenewSessionMutationLock,
  releaseSessionMutationLock: mockReleaseSessionMutationLock
}));

jest.mock('../../src/runtime/services/run-state.service', () => ({
  getRunById: mockGetRunById,
  markRunRunning: mockMarkRunRunning,
  markRunSucceeded: mockMarkRunSucceeded,
  markRunFailed: mockMarkRunFailed
}));

jest.mock('../../src/runtime/services/llm-config.service', () => ({
  resolveEffectiveLlmSelectionForRun: mockResolveEffectiveLlmSelectionForRun
}));

const { handleAgentRunTurn } = require('../../src/worker/handlers/agent-run-turn.handler');

describe('handleAgentRunTurn session serialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveConcurrencyPolicy.mockResolvedValue({
      maxActiveRuns: 20,
      retryHintSeconds: 30
    });
    mockGetRunById.mockResolvedValue({
      run_id: 'run-123',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-id',
      status: 'queued'
    });
    mockFlushBufferedRunStreamEvents.mockResolvedValue({
      flushed: true,
      eventCount: 0,
      insertedCount: 0,
      lastSeqNum: null
    });
  });

  it('defers the job when another worker already holds the session mutation lock', async () => {
    mockAcquireSessionMutationLock.mockResolvedValue({
      acquired: false,
      enforced: true
    });

    const job = {
      id: 'job-123',
      data: {
        runId: 'run-123'
      },
      moveToDelayed: jest.fn().mockResolvedValue()
    };

    await expect(handleAgentRunTurn(job, 'worker-token')).rejects.toHaveProperty('name', 'DelayedError');

    expect(mockRefreshActiveRunLease).toHaveBeenCalledWith({
      runId: 'run-123',
      userId: 'user-123',
      concurrencyPolicy: {
        maxActiveRuns: 20,
        retryHintSeconds: 30
      }
    });
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'worker-token');
    expect(mockMarkRunRunning).not.toHaveBeenCalled();
    expect(mockRunAgentTurn).not.toHaveBeenCalled();
    expect(mockAppendStreamEvent).not.toHaveBeenCalled();
    expect(mockReleaseSessionMutationLock).not.toHaveBeenCalled();
  });

  it('runs under the session mutation lock and releases resources on success', async () => {
    mockAcquireSessionMutationLock.mockResolvedValue({
      acquired: true,
      enforced: true,
      key: 'lock:key',
      token: 'lock-token',
      ttlMs: 300000
    });
    mockRunAgentTurn.mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      outputText: 'All set'
    });

    const result = await handleAgentRunTurn({
      id: 'job-123',
      data: {
        runId: 'run-123'
      },
      moveToDelayed: jest.fn().mockResolvedValue()
    }, 'worker-token');

    expect(mockMarkRunRunning).toHaveBeenCalledWith('run-123', {
      providerKey: 'anthropic',
      modelKey: 'claude-sonnet-4-6'
    });
    expect(mockRunAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      run_id: 'run-123'
    }), {
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6'
      }
    });
    expect(mockAppendStreamEvent).toHaveBeenCalledWith({
      runId: 'run-123',
      eventType: 'run.started',
      payload: {
        phase: 'worker',
        jobId: 'job-123'
      }
    });
    expect(mockAppendStreamEvent).toHaveBeenCalledWith({
      runId: 'run-123',
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: 'job-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6'
      }
    });
    expect(mockMarkRunSucceeded).toHaveBeenCalledWith('run-123');
    expect(mockReleaseActiveRunLease).toHaveBeenCalledWith({
      runId: 'run-123',
      userId: 'user-123'
    });
    expect(mockReleaseSessionMutationLock).toHaveBeenCalledWith({
      acquired: true,
      enforced: true,
      key: 'lock:key',
      token: 'lock-token',
      ttlMs: 300000
    });
    expect(mockFlushBufferedRunStreamEvents).toHaveBeenCalledWith('run-123');
    expect(mockMarkRunFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      runId: 'run-123',
      status: 'succeeded'
    });
  });

  it('defers provider rate limits instead of failing the run', async () => {
    mockAcquireSessionMutationLock.mockResolvedValue({
      acquired: true,
      enforced: true,
      key: 'lock:key',
      token: 'lock-token',
      ttlMs: 300000
    });

    const rateLimitError = Object.assign(
      new Error('This request would exceed your organization\'s rate limit of 30,000 input tokens per minute.'),
      {
        errorClass: 'rate_limited',
        headers: {
          'retry-after': '74',
          'anthropic-ratelimit-input-tokens-reset': '2026-03-29T18:01:08Z'
        }
      }
    );

    mockRunAgentTurn.mockRejectedValue(rateLimitError);

    const job = {
      id: 'job-123',
      data: {
        runId: 'run-123'
      },
      moveToDelayed: jest.fn().mockResolvedValue()
    };

    await expect(handleAgentRunTurn(job, 'worker-token')).rejects.toHaveProperty('name', 'DelayedError');

    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'worker-token');
    expect(mockMarkRunFailed).not.toHaveBeenCalled();
    expect(mockReleaseActiveRunLease).not.toHaveBeenCalled();
    expect(mockReleaseSessionMutationLock).toHaveBeenCalledWith({
      acquired: true,
      enforced: true,
      key: 'lock:key',
      token: 'lock-token',
      ttlMs: 300000
    });
    expect(mockAppendStreamEvent).toHaveBeenCalledWith({
      runId: 'run-123',
      eventType: 'run.deferred',
      payload: expect.objectContaining({
        phase: 'worker',
        reason: 'rate_limited',
        retryDelayMs: 75000,
        retryAt: expect.any(String),
        message: expect.stringContaining('30,000 input tokens per minute')
      })
    });
    expect(mockAppendStreamEvent.mock.calls.some(([event]) => event.eventType === 'run.failed')).toBe(false);
  });

  it('does not emit run.started again when retrying a run already marked running', async () => {
    mockGetRunById.mockResolvedValue({
      run_id: 'run-123',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-id',
      status: 'running'
    });
    mockAcquireSessionMutationLock.mockResolvedValue({
      acquired: true,
      enforced: true,
      key: 'lock:key',
      token: 'lock-token',
      ttlMs: 300000
    });
    mockRunAgentTurn.mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      outputText: 'Retry completed'
    });

    const result = await handleAgentRunTurn({
      id: 'job-123',
      data: {
        runId: 'run-123'
      },
      moveToDelayed: jest.fn().mockResolvedValue()
    }, 'worker-token');

    expect(mockMarkRunRunning).not.toHaveBeenCalled();
    expect(mockAppendStreamEvent.mock.calls.some(([event]) => event.eventType === 'run.started')).toBe(false);
    expect(mockAppendStreamEvent).toHaveBeenCalledWith({
      runId: 'run-123',
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: 'job-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6'
      }
    });
    expect(result).toEqual({
      runId: 'run-123',
      status: 'succeeded'
    });
  });
});
