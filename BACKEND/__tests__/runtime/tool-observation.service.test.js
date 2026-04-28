const mockAppendSessionEvent = jest.fn().mockResolvedValue({ event_id: 'event-123' });

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

const {
  appendToolObservationEvent,
  formatToolObservation
} = require('../../src/runtime/services/tool-observation.service');

describe('tool-observation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes memory search queries in compact observations', () => {
    const observation = formatToolObservation({
      toolName: 'memory_search',
      toolInput: {
        query: 'left knee pain after squats'
      },
      toolResult: {
        status: 'ok',
        output: {
          backend: 'postgres',
          results: [
            {
              sourceType: 'memory',
              score: 0.82,
              content: 'User reported left knee pain after high-volume squats.'
            }
          ]
        }
      }
    });

    expect(observation).toContain('Query: left knee pain after squats');
    expect(observation).toContain('Search backend: postgres');
    expect(observation).toContain('Results returned: 1');
  });

  it('persists memory search query on tool result events', async () => {
    await appendToolObservationEvent({
      run: {
        run_id: 'run-123',
        user_id: 'user-123',
        session_key: 'session-key',
        session_id: 'session-id'
      },
      iteration: 2,
      toolCall: {
        id: 'tool-1',
        name: 'memory_search',
        input: {
          query: 'bench press plateau'
        }
      },
      toolResult: {
        status: 'ok',
        output: {
          backend: 'redis',
          results: []
        }
      }
    });

    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'tool.result',
      payload: expect.objectContaining({
        toolName: 'memory_search',
        searchQuery: 'bench press plateau',
        observation: expect.stringContaining('Query: bench press plateau')
      })
    }));
  });

  it('keeps memory search queries visible when the tool returns an error', () => {
    const observation = formatToolObservation({
      toolName: 'memory_search',
      toolInput: {
        query: 'deadlift setup'
      },
      toolResult: {
        status: 'error',
        error: {
          code: 'SEARCH_UNAVAILABLE',
          explanation: 'Search backend is unavailable.'
        }
      }
    });

    expect(observation).toContain('Query: deadlift setup');
    expect(observation).toContain('Code: SEARCH_UNAVAILABLE');
  });
});
