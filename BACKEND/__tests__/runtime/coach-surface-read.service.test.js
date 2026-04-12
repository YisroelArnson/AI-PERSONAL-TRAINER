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
});
