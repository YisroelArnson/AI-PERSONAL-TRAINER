/**
 * File overview:
 * Contains automated tests for the transcript read service behavior.
 *
 * Main functions in this file:
 * - createQueryBuilder: Creates a Query builder used by this file.
 */

const mockGetSupabaseAdminClient = jest.fn();

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient
}));

const {
  listRecentTranscriptEventsForRun,
  toRuntimeMessages
} = require('../../src/runtime/services/transcript-read.service');

/**
 * Creates a Query builder used by this file.
 */
function createQueryBuilder({ maybeSingleResult, limitResult }) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn()
  };

  if (maybeSingleResult) {
    builder.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
    builder.limit.mockReturnValue(builder);
  } else {
    builder.limit.mockResolvedValue(limitResult);
  }

  return builder;
}

describe('listRecentTranscriptEventsForRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bounds transcript context to the triggering user event seq_num', async () => {
    const triggerLookupQuery = createQueryBuilder({
      maybeSingleResult: {
        data: {
          seq_num: 42
        },
        error: null
      }
    });
    const transcriptQuery = createQueryBuilder({
      limitResult: {
        data: [
          { event_id: 'event-42', seq_num: 42 },
          { event_id: 'event-41', seq_num: 41 }
        ],
        error: null
      }
    });
    const from = jest.fn()
      .mockReturnValueOnce(triggerLookupQuery)
      .mockReturnValueOnce(transcriptQuery);

    mockGetSupabaseAdminClient.mockReturnValue({
      from
    });

    const events = await listRecentTranscriptEventsForRun({
      run_id: 'run-123',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-id'
    }, 12);

    expect(transcriptQuery.lte).toHaveBeenCalledWith('seq_num', 42);
    expect(events).toEqual([
      { event_id: 'event-41', seq_num: 41 },
      { event_id: 'event-42', seq_num: 42 }
    ]);
  });

  it('does not promote streamed assistant deltas into durable prompt history', async () => {
    const triggerLookupQuery = createQueryBuilder({
      maybeSingleResult: {
        data: {
          seq_num: 4
        },
        error: null
      }
    });
    const transcriptQuery = createQueryBuilder({
      limitResult: {
        data: [
          {
            event_id: 'event-4',
            seq_num: 4,
            actor: 'user',
            run_id: 'run-current',
            payload: {
              message: 'How are you today?'
            }
          },
          {
            event_id: 'event-3',
            seq_num: 3,
            actor: 'user',
            run_id: 'run-previous',
            payload: {
              message: 'When was my last workout?'
            }
          }
        ],
        error: null
      }
    });
    const from = jest.fn()
      .mockReturnValueOnce(triggerLookupQuery)
      .mockReturnValueOnce(transcriptQuery);

    mockGetSupabaseAdminClient.mockReturnValue({
      from
    });

    const events = await listRecentTranscriptEventsForRun({
      run_id: 'run-current',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-id'
    }, 12);
    const messages = toRuntimeMessages(events);

    expect(from).toHaveBeenCalledTimes(2);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'When was my last workout?'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'How are you today?'
          }
        ]
      }
    ]);
  });

  it('renders compact tool result events into prompt messages', () => {
    expect(toRuntimeMessages([
      {
        event_type: 'user.message',
        actor: 'user',
        payload: {
          message: 'When was my last workout?'
        }
      },
      {
        event_type: 'tool.result',
        actor: 'tool',
        payload: {
          toolName: 'workout_history_fetch',
          resultStatus: 'ok',
          observation: 'Window: 2026-04-01 to 2026-04-24; returned 2.'
        }
      }
    ])).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'When was my last workout?'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Tool result - workout_history_fetch (ok):\nWindow: 2026-04-01 to 2026-04-24; returned 2.'
          }
        ]
      }
    ]);
  });

  it('places late-arriving tool result rows next to their triggering user turn', async () => {
    const triggerLookupQuery = createQueryBuilder({
      maybeSingleResult: {
        data: {
          seq_num: 3
        },
        error: null
      }
    });
    const transcriptQuery = createQueryBuilder({
      limitResult: {
        data: [
          {
            event_id: 'tool-event-late',
            seq_num: 3,
            event_type: 'tool.result',
            actor: 'tool',
            run_id: 'run-previous',
            payload: {
              toolName: 'workout_history_fetch',
              resultStatus: 'ok',
              observation: 'Window: 2026-04-01 to 2026-04-24; returned 2.'
            }
          },
          {
            event_id: 'event-current',
            seq_num: 2,
            event_type: 'user.message',
            actor: 'user',
            run_id: 'run-current',
            payload: {
              message: 'How are you today?'
            }
          },
          {
            event_id: 'event-previous',
            seq_num: 1,
            event_type: 'user.message',
            actor: 'user',
            run_id: 'run-previous',
            payload: {
              message: 'When was my last workout?'
            }
          }
        ],
        error: null
      }
    });
    const from = jest.fn()
      .mockReturnValueOnce(triggerLookupQuery)
      .mockReturnValueOnce(transcriptQuery);

    mockGetSupabaseAdminClient.mockReturnValue({
      from
    });

    const messages = toRuntimeMessages(await listRecentTranscriptEventsForRun({
      run_id: 'run-current',
      user_id: 'user-123',
      session_key: 'session-key',
      session_id: 'session-id'
    }, 12));

    expect(messages.map(message => message.content[0].text)).toEqual([
      'When was my last workout?',
      'Tool result - workout_history_fetch (ok):\nWindow: 2026-04-01 to 2026-04-24; returned 2.',
      'How are you today?'
    ]);
  });
});
