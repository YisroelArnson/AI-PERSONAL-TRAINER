describe('session-compaction.service module wiring', () => {
  it('can compact after transcript-write is required first', async () => {
    let compactSession;
    let mockRpc;
    let mockUpdate;
    let mockEnqueueSessionCompaction;
    let mockEnqueueSessionIndexSync;
    let mockEnqueueSessionIndexSyncIfNeeded;

    jest.isolateModules(() => {
      mockRpc = jest.fn().mockResolvedValue({
        data: {
          eventId: 'evt-compaction-summary',
          seqNum: 5
        },
        error: null
      });
      mockUpdate = jest.fn().mockResolvedValue({
        data: null,
        error: null
      });
      mockEnqueueSessionCompaction = jest.fn().mockResolvedValue({
        jobId: 'compact-queued'
      });
      mockEnqueueSessionIndexSync = jest.fn().mockResolvedValue({
        jobId: 'index-immediate'
      });
      mockEnqueueSessionIndexSyncIfNeeded = jest.fn().mockResolvedValue({
        jobId: 'index-debounced'
      });

      jest.doMock('../../src/config/env', () => ({
        env: {
          sessionCompactionMinEventCount: 2,
          sessionCompactionMinMessageCount: 2,
          sessionCompactionDebounceMs: 1000
        }
      }));

      jest.doMock('../../src/infra/redis/connection', () => ({
        getRedisConnection: jest.fn(() => null)
      }));

      jest.doMock('../../src/infra/queue/agent.queue', () => ({
        enqueueSessionCompaction: mockEnqueueSessionCompaction,
        enqueueSessionIndexSync: mockEnqueueSessionIndexSync
      }));

      jest.doMock('../../src/runtime/services/indexing-queue.service', () => ({
        enqueueSessionIndexSyncIfNeeded: mockEnqueueSessionIndexSyncIfNeeded
      }));

      jest.doMock('../../src/runtime/services/session-reset-policy.service', () => ({
        resolveSessionContinuityPolicy: jest.fn().mockResolvedValue({
          timezone: 'America/New_York',
          sessionMemoryMessageCount: 15
        })
      }));

      jest.doMock('../../src/runtime/services/transcript-read.service', () => ({
        listTranscriptEventsForSession: jest.fn().mockResolvedValue([
          {
            seq_num: 1,
            event_type: 'user.message',
            actor: 'user',
            payload: {
              message: 'Start'
            }
          },
          {
            seq_num: 2,
            event_type: 'assistant.notify',
            actor: 'assistant',
            payload: {
              text: 'Ready'
            }
          }
        ])
      }));

      jest.doMock('../../src/infra/supabase/client', () => ({
        getSupabaseAdminClient: jest.fn(() => ({
          rpc: mockRpc,
          from(table) {
            if (table !== 'session_state') {
              throw new Error(`Unexpected table ${table}`);
            }

            return {
              select() {
                return this;
              },
              update(patch) {
                mockUpdate(patch);
                return this;
              },
              eq() {
                return this;
              },
              lt() {
                return this;
              },
              async maybeSingle() {
                return {
                  data: {
                    user_id: 'user-123',
                    session_key: 'user:user-123:main',
                    current_session_id: 'session-123',
                    compaction_count: 0,
                    memory_flush_compaction_count: 1
                  },
                  error: null
                };
              },
              then(resolve, reject) {
                return Promise.resolve({
                  data: null,
                  error: null
                }).then(resolve, reject);
              }
            };
          }
        }))
      }));

      require('../../src/runtime/services/transcript-write.service');
      ({ compactSession } = require('../../src/runtime/services/session-compaction.service'));
    });

    const result = await compactSession({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123',
      nextCompactionCount: 1
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'compacted',
      nextCompactionCount: 1
    }));
    expect(mockRpc).toHaveBeenCalledWith(
      'append_session_event',
      expect.objectContaining({
        p_event_type: 'compaction.summary',
        p_actor: 'system',
        p_idempotency_key: 'compaction.summary:session-123:1'
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      compaction_count: 1
    });
    expect(mockEnqueueSessionIndexSync).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123',
      mode: 'immediate',
      delayMs: 0
    });
  });
});
