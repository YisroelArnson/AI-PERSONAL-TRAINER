const mockAppendStreamEvent = jest.fn().mockResolvedValue();
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

jest.mock('../../src/config/env', () => ({
  env: {
    defaultLlmProvider: 'anthropic',
    defaultAnthropicModel: 'claude-sonnet-4-6'
  }
}));

jest.mock('../../src/runtime/services/stream-events.service', () => ({
  appendStreamEvent: mockAppendStreamEvent
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
    }));
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
    expect(mockMarkRunFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      runId: 'run-123',
      status: 'succeeded'
    });
  });
});
