/**
 * File overview:
 * Contains automated tests for the session memory flush service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  buildSessionExcerptMarkdown,
  buildSessionMemoryMarker,
  normalizeSessionMemoryMessageCount,
  shouldIncludeSessionMemoryEvent
} = require('../../src/runtime/services/session-memory-flush.service');

describe('session-memory-flush.service', () => {
  it('filters to visible user and assistant messages only', () => {
    expect(shouldIncludeSessionMemoryEvent({
      actor: 'user',
      event_type: 'user.message',
      payload: {
        message: 'Can you help me debug this?'
      }
    })).toBe(true);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'user',
      event_type: 'user.message',
      payload: {
        message: '/new'
      }
    })).toBe(false);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'assistant',
      event_type: 'assistant.notify',
      payload: {
        text: 'Absolutely.'
      }
    })).toBe(true);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'assistant',
      event_type: 'assistant.ask',
      payload: {
        text: 'hidden',
        metadata: {
          hiddenInFeed: true
        }
      }
    })).toBe(false);
  });

  it('formats a deterministic session excerpt block', () => {
    const markdown = buildSessionExcerptMarkdown({
      sessionKey: 'user:123:main',
      sessionId: 'abc123',
      endedAt: '2026-03-20T14:30:00.000Z',
      rotationReason: 'manual_reset',
      entries: [
        {
          role: 'user',
          text: 'Can you help me debug this?'
        },
        {
          role: 'assistant',
          text: 'Yes, what error are you seeing?'
        }
      ]
    });

    expect(markdown).toContain(buildSessionMemoryMarker('abc123'));
    expect(markdown).toContain('- **Session Key**: user:123:main');
    expect(markdown).toContain('- **Session ID**: abc123');
    expect(markdown).toContain('- **Rotation Reason**: manual_reset');
    expect(markdown).toContain('user: Can you help me debug this?');
    expect(markdown).toContain('assistant: Yes, what error are you seeing?');
  });

  it('normalizes invalid message counts to a safe floor', () => {
    expect(normalizeSessionMemoryMessageCount(0)).toBe(1);
    expect(normalizeSessionMemoryMessageCount('15')).toBe(15);
    expect(normalizeSessionMemoryMessageCount(undefined)).toBe(15);
  });

  it('appends a pre-compaction audit event to the active session id', async () => {
    let flushSessionMemoryToEpisodicDate;
    const mockAppendSessionEvent = jest.fn().mockResolvedValue({
      eventId: 'evt-memory-flush'
    });

    jest.isolateModules(() => {
      jest.doMock('../../src/runtime/services/memory-docs.service', () => ({
        appendEpisodicNoteBlock: jest.fn().mockResolvedValue({
          status: 'updated',
          changed: true
        })
      }));

      jest.doMock('../../src/runtime/services/transcript-write.service', () => ({
        appendSessionEvent: mockAppendSessionEvent
      }));

      jest.doMock('../../src/runtime/services/timezone-date.service', () => ({
        getDateKeyInTimezone: jest.fn(() => '2026-04-27')
      }));

      jest.doMock('../../src/infra/supabase/client', () => ({
        getSupabaseAdminClient: jest.fn(() => ({
          from(table) {
            if (table !== 'session_events') {
              throw new Error(`Unexpected table ${table}`);
            }

            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              order() {
                return this;
              },
              range() {
                return this;
              },
              then(resolve, reject) {
                return Promise.resolve({
                  data: [
                    {
                      actor: 'user',
                      event_type: 'user.message',
                      payload: {
                        message: 'I am ready.'
                      },
                      occurred_at: '2026-04-27T14:00:00.000Z'
                    },
                    {
                      actor: 'assistant',
                      event_type: 'assistant.notify',
                      payload: {
                        text: 'Let us begin.'
                      },
                      occurred_at: '2026-04-27T14:01:00.000Z'
                    }
                  ],
                  error: null
                }).then(resolve, reject);
              }
            };
          }
        }))
      }));

      ({ flushSessionMemoryToEpisodicDate } = require('../../src/runtime/services/session-memory-flush.service'));
    });

    await flushSessionMemoryToEpisodicDate({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123',
      timezone: 'America/New_York',
      messageCount: 2,
      flushKind: 'pre_compaction',
      currentCompactionCount: 1
    });

    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123',
      eventType: 'memory.flush.executed',
      idempotencyKey: 'memory.flush_pre_compaction:session-123:1'
    }));
  });
});
