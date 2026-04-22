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
  listRecentTranscriptEventsForRun
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
});
