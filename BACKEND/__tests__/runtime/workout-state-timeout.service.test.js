/**
 * File overview:
 * Contains automated tests for the workout state timeout service behavior.
 *
 * Main functions in this file:
 * - createWorkoutSessionSelectChain: Creates a Workout session select chain used by this file.
 * - createWorkoutSessionUpdateChain: Creates a Workout session update chain used by this file.
 */

const mockGetRedisConnection = jest.fn();
const mockGetSupabaseAdminClient = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../src/infra/redis/connection', () => ({
  getRedisConnection: mockGetRedisConnection
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient
}));

jest.mock('../../src/runtime/services/session-reset-policy.service', () => ({
  resolveSessionContinuityPolicy: mockResolveSessionContinuityPolicy
}));

const { getCurrentWorkoutState } = require('../../src/runtime/services/workout-state.service');

/**
 * Creates a Workout session select chain used by this file.
 */
function createWorkoutSessionSelectChain(session) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: session,
      error: null
    })
  };
}

/**
 * Creates a Workout session update chain used by this file.
 */
function createWorkoutSessionUpdateChain(updatedSession, patches) {
  return {
    update: jest.fn(patch => {
      patches.push(patch);

      return {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: updatedSession,
              error: null
            })
          })
        })
      };
    })
  };
}

describe('getCurrentWorkoutState stale timeout handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    mockGetRedisConnection.mockReturnValue(null);
    mockResolveSessionContinuityPolicy.mockResolvedValue({
      idleExpiryMinutes: 240
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('abandons a stale live workout instead of returning it as current', async () => {
    const staleSession = {
      workout_session_id: 'workout-1',
      user_id: 'user-123',
      session_key: 'user:user-123:main',
      state_version: 7,
      status: 'in_progress',
      current_phase: 'exercise',
      title: 'Day B',
      guidance_json: {},
      summary_json: {},
      current_exercise_index: 0,
      current_set_index: 1,
      created_at: '2026-04-01T07:00:00.000Z',
      started_at: '2026-04-01T07:05:00.000Z',
      completed_at: null,
      updated_at: '2026-04-01T07:30:00.000Z'
    };
    const updatedSession = {
      ...staleSession,
      state_version: 8,
      status: 'abandoned',
      current_phase: 'finished'
    };
    const sessionPatches = [];
    let workoutSessionCallCount = 0;

    mockGetSupabaseAdminClient.mockReturnValue({
      from: mockFrom
    });
    mockFrom.mockImplementation(table => {
      if (table !== 'workout_sessions') {
        throw new Error(`Unexpected table: ${table}`);
      }

      workoutSessionCallCount += 1;

      if (workoutSessionCallCount === 1) {
        return createWorkoutSessionSelectChain(staleSession);
      }

      if (workoutSessionCallCount === 2) {
        return createWorkoutSessionUpdateChain(updatedSession, sessionPatches);
      }

      throw new Error(`Unexpected workout_sessions call #${workoutSessionCallCount}`);
    });

    const result = await getCurrentWorkoutState({
      userId: 'user-123',
      sessionKey: 'user:user-123:main'
    });

    expect(result).toBeNull();
    expect(mockResolveSessionContinuityPolicy).toHaveBeenCalledWith('user-123');
    expect(sessionPatches).toEqual([
      expect.objectContaining({
        state_version: 8,
        status: 'abandoned',
        current_phase: 'finished',
        completed_at: null,
        summary_json: expect.objectContaining({
          abandonment: expect.objectContaining({
            reason: 'idle_timeout',
            idleExpiryMinutes: 240,
            lastTouchedAt: '2026-04-01T07:30:00.000Z'
          })
        })
      })
    ]);
  });
});
