/**
 * File overview:
 * Contains automated tests for the queue recovery service behavior.
 *
 * Main functions in this file:
 * - createSelectBuilder: Creates a Select builder used by this file.
 */

const mockEnqueueAgentRunTurn = jest.fn();
const mockEnqueueDeliveryRetry = jest.fn();
const mockEnqueueDeliverySend = jest.fn();
const mockEnqueueMemoryDocIndexSync = jest.fn();
const mockEnqueuePreCompactionMemoryFlush = jest.fn();
const mockEnqueueSessionCompaction = jest.fn();
const mockEnqueueSessionIndexSync = jest.fn();
const mockEnqueueSessionMemoryFlush = jest.fn();
const mockGetQueue = jest.fn();
const mockGetDeliveryRecordById = jest.fn();
const mockListPendingDeliveryRecords = jest.fn();
const mockGetDeadLetterById = jest.fn();
const mockListOpenDeadLetters = jest.fn();
const mockMarkDeadLetterReplayed = jest.fn();
const mockGetMemoryDocRecord = jest.fn();
const mockGetSessionIndexState = jest.fn();
const mockGetSupabaseAdminClient = jest.fn();
const mockGetRunById = jest.fn();
const mockListRunsByStatus = jest.fn();
const mockMarkRunQueuedForReplay = jest.fn();
const mockAppendSessionEvent = jest.fn();
const mockGetSessionCompactionSnapshot = jest.fn();
const mockIsSessionCompactionEligible = jest.fn();

jest.mock('../../src/infra/queue/agent.queue', () => ({
  enqueueAgentRunTurn: mockEnqueueAgentRunTurn,
  enqueueDeliveryRetry: mockEnqueueDeliveryRetry,
  enqueueDeliverySend: mockEnqueueDeliverySend,
  enqueueMemoryDocIndexSync: mockEnqueueMemoryDocIndexSync,
  enqueuePreCompactionMemoryFlush: mockEnqueuePreCompactionMemoryFlush,
  enqueueSessionCompaction: mockEnqueueSessionCompaction,
  enqueueSessionIndexSync: mockEnqueueSessionIndexSync,
  enqueueSessionMemoryFlush: mockEnqueueSessionMemoryFlush,
  getQueue: mockGetQueue
}));

jest.mock('../../src/runtime/services/delivery-outbox.service', () => ({
  getDeliveryRecordById: mockGetDeliveryRecordById,
  listPendingDeliveryRecords: mockListPendingDeliveryRecords
}));

jest.mock('../../src/runtime/services/dead-letter.service', () => ({
  getDeadLetterById: mockGetDeadLetterById,
  listOpenDeadLetters: mockListOpenDeadLetters,
  markDeadLetterReplayed: mockMarkDeadLetterReplayed
}));

jest.mock('../../src/runtime/services/indexing-state.service', () => ({
  getMemoryDocRecord: mockGetMemoryDocRecord,
  getSessionIndexState: mockGetSessionIndexState
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient
}));

jest.mock('../../src/runtime/services/run-state.service', () => ({
  getRunById: mockGetRunById,
  listRunsByStatus: mockListRunsByStatus,
  markRunQueuedForReplay: mockMarkRunQueuedForReplay
}));

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

jest.mock('../../src/runtime/services/session-compaction.service', () => ({
  getSessionCompactionSnapshot: mockGetSessionCompactionSnapshot,
  isSessionCompactionEligible: mockIsSessionCompactionEligible
}));

const { JOB_NAMES } = require('../../src/infra/queue/queue.constants');
const { reconcileQueueState, replayDeadLetterById } = require('../../src/runtime/services/queue-recovery.service');

/**
 * Creates a Select builder used by this file.
 */
function createSelectBuilder(rows) {
  return {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({
      data: rows,
      error: null
    })
  };
}

describe('queue-recovery.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetQueue.mockReturnValue({
      getJob: jest.fn().mockResolvedValue(null)
    });

    mockGetSupabaseAdminClient.mockReturnValue({
      from: jest.fn(tableName => {
        if (tableName === 'session_index_state') {
          return {
            select: jest.fn(() => createSelectBuilder([
              {
                user_id: 'user-123',
                session_key: 'session-key',
                session_id: 'session-123',
                index_dirty: true
              }
            ]))
          };
        }

        if (tableName === 'memory_docs') {
          return {
            select: jest.fn(() => createSelectBuilder([
              {
                user_id: 'user-123',
                doc_id: 'doc-123',
                index_dirty: true
              }
            ]))
          };
        }

        throw new Error(`Unexpected table ${tableName}`);
      })
    });

    mockListRunsByStatus.mockResolvedValue([
      {
        run_id: 'run-123',
        user_id: 'user-123',
        session_key: 'session-key',
        session_id: 'session-123'
      }
    ]);
    mockListPendingDeliveryRecords.mockResolvedValue([
      {
        delivery_id: 'delivery-123',
        run_id: 'run-123',
        user_id: 'user-123',
        attempt_count: 0
      }
    ]);
    mockGetSessionCompactionSnapshot.mockResolvedValue({
      state: {
        user_id: 'user-123',
        session_key: 'session-key'
      },
      nextCompactionCount: 1
    });
    mockIsSessionCompactionEligible.mockReturnValue(true);

    mockEnqueueAgentRunTurn.mockResolvedValue({ jobId: 'agent.run_turn:run-123' });
    mockEnqueueDeliverySend.mockResolvedValue({ jobId: 'delivery.send:delivery-123' });
    mockEnqueueSessionIndexSync.mockResolvedValue({ jobId: 'memory.index_session_delta:session-123' });
    mockEnqueueMemoryDocIndexSync.mockResolvedValue({ jobId: 'memory.index_doc:doc-123' });
    mockEnqueueSessionCompaction.mockResolvedValue({ jobId: 'session.compact:session-123:c1' });
  });

  it('replays dead-lettered agent runs using current canonical state', async () => {
    mockGetDeadLetterById.mockResolvedValue({
      dead_letter_id: 'dead-letter-123',
      job_name: JOB_NAMES.agentRunTurn,
      run_id: 'run-123'
    });
    mockGetRunById.mockResolvedValue({
      run_id: 'run-123',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-123'
    });
    mockEnqueueAgentRunTurn.mockResolvedValue({
      jobId: 'agent.run_turn:run-123'
    });

    const result = await replayDeadLetterById('dead-letter-123');

    expect(mockMarkRunQueuedForReplay).toHaveBeenCalledWith('run-123');
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: 'session-key',
      sessionId: 'session-123',
      runId: 'run-123',
      eventType: 'system.retry',
      payload: expect.objectContaining({
        deadLetterId: 'dead-letter-123',
        originalJobName: JOB_NAMES.agentRunTurn
      })
    }));
    expect(mockMarkDeadLetterReplayed).toHaveBeenCalledWith(
      'dead-letter-123',
      'agent.run_turn:run-123'
    );
    expect(result).toEqual({
      jobId: 'agent.run_turn:run-123'
    });
  });

  it('reconciles missing queue work across runs, deliveries, indexing, and compaction', async () => {
    const result = await reconcileQueueState(25);

    expect(mockEnqueueAgentRunTurn).toHaveBeenCalledWith({
      runId: 'run-123',
      userId: 'user-123',
      sessionKey: 'session-key',
      sessionId: 'session-123'
    });
    expect(mockEnqueueDeliverySend).toHaveBeenCalledWith({
      deliveryId: 'delivery-123',
      runId: 'run-123',
      userId: 'user-123'
    });
    expect(mockEnqueueSessionIndexSync).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionKey: 'session-key',
      sessionId: 'session-123',
      mode: 'immediate',
      delayMs: 0
    });
    expect(mockEnqueueMemoryDocIndexSync).toHaveBeenCalledWith({
      userId: 'user-123',
      docId: 'doc-123',
      delayMs: 0
    });
    expect(mockEnqueueSessionCompaction).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionKey: 'session-key',
      sessionId: 'session-123',
      nextCompactionCount: 1,
      delayMs: 0
    });
    expect(result).toEqual({
      repairedRunJobs: 1,
      repairedDeliveryJobs: 1,
      repairedIndexJobs: 2,
      repairedCompactionJobs: 1
    });
  });
});
