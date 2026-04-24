/**
 * File overview:
 * Contains automated tests for the coach surface read service behavior.
 *
 * Main functions in this file:
 * - createSelectChain: Creates a Select chain used by this file.
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetCurrentWorkoutState = jest.fn();

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    rpc: mockRpc,
    from: mockFrom
  }))
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  getCurrentWorkoutState: mockGetCurrentWorkoutState
}));

const { buildCoachSurfaceView } = require('../../src/runtime/services/coach-surface-read.service');

/**
 * Creates a Select chain used by this file.
 */
function createSelectChain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({
      data: result,
      error: null
    })
  };
}

describe('buildCoachSurfaceView active run visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRpc.mockResolvedValue({
      data: {
        sessionId: 'session-123',
        sessionVersion: 1,
        rotated: false,
        rotationReason: null,
        previousSessionId: null,
        sessionKey: 'user:user-123:main'
      },
      error: null
    });
    mockGetCurrentWorkoutState.mockResolvedValue(null);
  });

  it('filters out background workout follow-up runs from the surface active run slot', async () => {
    const feedChain = createSelectChain([]);
    const runsChain = createSelectChain([
      {
        run_id: 'run-background',
        status: 'running',
        trigger_type: 'ui.action.start_workout',
        trigger_payload: {
          metadata: {
            runVisibility: 'background'
          }
        },
        created_at: '2026-03-31T10:00:00.000Z',
        started_at: '2026-03-31T10:00:01.000Z',
        finished_at: null,
        provider_key: 'anthropic',
        model_key: 'claude'
      },
      {
        run_id: 'run-foreground',
        status: 'running',
        trigger_type: 'user.message',
        trigger_payload: {
          metadata: {}
        },
        created_at: '2026-03-31T09:59:00.000Z',
        started_at: '2026-03-31T09:59:01.000Z',
        finished_at: null,
        provider_key: 'anthropic',
        model_key: 'claude'
      }
    ]);

    mockFrom.mockImplementation(table => {
      if (table === 'session_events') {
        return feedChain;
      }

      if (table === 'runs') {
        return runsChain;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    const result = await buildCoachSurfaceView({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionResetPolicy: {
        timezone: 'America/New_York',
        dayBoundaryEnabled: true,
        idleExpiryMinutes: 240
      }
    });

    expect(result.view.activeRun).toEqual(expect.objectContaining({
      runId: 'run-foreground',
      triggerType: 'user.message'
    }));
  });

  it('omits the active run when only background workout follow-ups are pending', async () => {
    const feedChain = createSelectChain([]);
    const runsChain = createSelectChain([
      {
        run_id: 'run-background',
        status: 'queued',
        trigger_type: 'ui.action.finish_workout',
        trigger_payload: {
          metadata: {
            runVisibility: 'background'
          }
        },
        created_at: '2026-03-31T10:00:00.000Z',
        started_at: null,
        finished_at: null,
        provider_key: null,
        model_key: null
      }
    ]);

    mockFrom.mockImplementation(table => {
      if (table === 'session_events') {
        return feedChain;
      }

      if (table === 'runs') {
        return runsChain;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    const result = await buildCoachSurfaceView({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionResetPolicy: {
        timezone: 'America/New_York',
        dayBoundaryEnabled: true,
        idleExpiryMinutes: 240
      }
    });

    expect(result.view.activeRun).toBeNull();
    expect(result.view.header.subtitle).toBe('One calm surface for training, planning, and check-ins');
  });

  it('treats app-opened runs as background even without explicit visibility metadata', async () => {
    const feedChain = createSelectChain([]);
    const runsChain = createSelectChain([
      {
        run_id: 'run-app-open',
        status: 'running',
        trigger_type: 'app.opened',
        trigger_payload: {
          metadata: {
            hiddenInFeed: true
          }
        },
        created_at: '2026-03-31T10:00:00.000Z',
        started_at: '2026-03-31T10:00:01.000Z',
        finished_at: null,
        provider_key: 'anthropic',
        model_key: 'claude'
      }
    ]);

    mockFrom.mockImplementation(table => {
      if (table === 'session_events') {
        return feedChain;
      }

      if (table === 'runs') {
        return runsChain;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    const result = await buildCoachSurfaceView({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionResetPolicy: {
        timezone: 'America/New_York',
        dayBoundaryEnabled: true,
        idleExpiryMinutes: 240
      }
    });

    expect(result.view.activeRun).toBeNull();
  });

  it('maps assistant notify and ask transcript events into visible feed items', async () => {
    const feedChain = createSelectChain([
      {
        event_id: 'evt-user',
        event_type: 'user.message',
        actor: 'user',
        run_id: 'run-user',
        seq_num: 1,
        occurred_at: '2026-03-31T09:58:00.000Z',
        payload: {
          text: 'Help me plan today.'
        }
      },
      {
        event_id: 'evt-notify',
        event_type: 'assistant.notify',
        actor: 'assistant',
        run_id: 'run-notify',
        seq_num: 2,
        occurred_at: '2026-03-31T09:58:10.000Z',
        payload: {
          text: 'I mapped out a plan for today.',
          kind: 'notify',
          delivery: 'feed'
        }
      },
      {
        event_id: 'evt-ask',
        event_type: 'assistant.ask',
        actor: 'assistant',
        run_id: 'run-ask',
        seq_num: 3,
        occurred_at: '2026-03-31T09:58:20.000Z',
        payload: {
          text: 'Do you want a short session or a full workout?',
          kind: 'ask',
          delivery: 'feed'
        }
      }
    ]);
    const runsChain = createSelectChain([]);

    mockFrom.mockImplementation(table => {
      if (table === 'session_events') {
        return feedChain;
      }

      if (table === 'runs') {
        return runsChain;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    const result = await buildCoachSurfaceView({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionResetPolicy: {
        timezone: 'America/New_York',
        dayBoundaryEnabled: true,
        idleExpiryMinutes: 240
      }
    });

    expect(result.view.feed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'evt-notify',
        role: 'assistant',
        text: 'I mapped out a plan for today.',
        eventType: 'assistant.notify'
      }),
      expect.objectContaining({
        id: 'evt-ask',
        role: 'assistant',
        text: 'Do you want a short session or a full workout?',
        eventType: 'assistant.ask'
      })
    ]));
  });

  it('filters assistant events from runs superseded by a newer user turn', async () => {
    const feedChain = createSelectChain([
      {
        event_id: 'evt-stale-assistant',
        event_type: 'assistant.notify',
        actor: 'assistant',
        run_id: 'run-app-open',
        seq_num: 3,
        occurred_at: '2026-03-31T09:58:08.000Z',
        payload: {
          text: 'Welcome back. Want me to build your workout?',
          kind: 'notify',
          delivery: 'feed'
        }
      },
      {
        event_id: 'evt-user-visible',
        event_type: 'user.message',
        actor: 'user',
        run_id: 'run-user-message',
        seq_num: 2,
        occurred_at: '2026-03-31T09:58:05.000Z',
        payload: {
          text: 'Hey how are you'
        }
      },
      {
        event_id: 'evt-app-open',
        event_type: 'app.opened',
        actor: 'user',
        run_id: 'run-app-open',
        seq_num: 1,
        occurred_at: '2026-03-31T09:58:00.000Z',
        payload: {
          text: 'app_opened',
          metadata: {
            hiddenInFeed: true
          }
        }
      }
    ]);
    const runsChain = createSelectChain([]);

    mockFrom.mockImplementation(table => {
      if (table === 'session_events') {
        return feedChain;
      }

      if (table === 'runs') {
        return runsChain;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    const result = await buildCoachSurfaceView({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionResetPolicy: {
        timezone: 'America/New_York',
        dayBoundaryEnabled: true,
        idleExpiryMinutes: 240
      }
    });

    expect(result.view.feed).toEqual([
      expect.objectContaining({
        id: 'evt-user-visible',
        role: 'user',
        text: 'Hey how are you'
      })
    ]);
  });
});
