jest.mock('@supabase/supabase-js', () => {
  const { buildSupabaseMock } = require('./helpers/supabaseMock');
  return buildSupabaseMock();
});

const { __mockChain: mockChain } = require('@supabase/supabase-js');

const {
  calculateSessionStats,
  calculateWeeklyStats,
  getCurrentWeekBounds
} = require('../services/statsCalculator.service');

beforeEach(() => {
  mockChain.reset();
});

describe('calculateSessionStats', () => {
  it('aggregates reps/volume/duration from exercise rows', () => {
    const result = calculateSessionStats({
      exercises: [
        {
          status: 'completed',
          total_reps: 24,
          volume: 1200,
          duration_sec: 180,
          payload_json: {
            performance: {
              sets: [
                { actual_reps: 12 },
                { actual_reps: 12 }
              ]
            }
          }
        },
        {
          status: 'skipped',
          total_reps: 0,
          volume: 0,
          duration_sec: 60,
          payload_json: { performance: { sets: [] } }
        }
      ],
      actions: [],
      session: { session_rpe: 7 },
      workout: { actual_duration_min: 42 }
    });

    expect(result.total_exercises).toBe(2);
    expect(result.exercises_completed).toBe(2);
    expect(result.exercises_skipped).toBe(1);
    expect(result.total_sets).toBe(2);
    expect(result.total_reps).toBe(24);
    expect(result.total_volume).toBe(1200);
    expect(result.cardio_time_min).toBe(4);
    expect(result.workout_duration_min).toBe(42);
    expect(result.energy_rating).toBe(7);
  });

  it('counts pain flags from note commands', () => {
    const result = calculateSessionStats({
      exercises: [],
      actions: [
        { action_type: 'set_exercise_note', action_payload_json: { command: { notes: 'Pain in right knee' } } },
        { action_type: 'set_exercise_note', action_payload_json: { command: { notes: 'All good' } } }
      ],
      session: {},
      workout: null
    });

    expect(result.pain_flags).toBe(1);
  });
});

describe('getCurrentWeekBounds', () => {
  it('returns Monday start and Sunday end', () => {
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getHours()).toBe(0);
    expect(weekEnd.getDay()).toBe(0);
    expect(weekEnd.getHours()).toBe(23);
  });
});

describe('calculateWeeklyStats', () => {
  const weekStart = new Date('2026-02-09T00:00:00Z');
  const weekEnd = new Date('2026-02-15T23:59:59Z');

  it('returns zero totals when no completed sessions', async () => {
    mockChain.mockTable('workout_sessions', []);
    mockChain.mockTable('trainer_calendar_events', []);

    const result = await calculateWeeklyStats('user-1', weekStart, weekEnd);
    expect(result.sessions_completed).toBe(0);
    expect(result.total_reps).toBe(0);
    expect(result.total_volume).toBe(0);
    expect(result.sessions_planned).toBe(0);
  });
});
