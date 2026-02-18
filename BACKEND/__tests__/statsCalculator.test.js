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

const { repsExercise, holdExercise, durationExercise, intervalsExercise } = require('./fixtures/exercises');
const { sampleSetEvents, sampleIntervalEvents, sampleSafetyEvents } = require('./fixtures/sessionEvents');

beforeEach(() => {
  mockChain.reset();
});

// ─── Pure Function Tests ─────────────────────────────────────────────

describe('calculateSessionStats', () => {
  const baseSession = {
    created_at: '2026-02-16T10:00:00Z',
    updated_at: '2026-02-16T10:45:00Z',
    metadata: { energy_level: 3 }
  };

  it('returns zeros for empty events with exercises in instance', () => {
    const instance = { exercises: [repsExercise, holdExercise, durationExercise, intervalsExercise] };
    const result = calculateSessionStats(instance, [], baseSession);

    expect(result.total_exercises).toBe(4);
    expect(result.exercises_completed).toBe(4);
    expect(result.total_sets).toBe(0);
    expect(result.total_reps).toBe(0);
    expect(result.total_volume).toBe(0);
  });

  it('calculates correct totals from set events', () => {
    const instance = { exercises: [repsExercise, holdExercise] };
    const result = calculateSessionStats(instance, sampleSetEvents, baseSession);

    expect(result.total_sets).toBe(4);
    expect(result.total_reps).toBe(40);
    expect(result.total_volume).toBe(1060);
  });

  it('calculates cardio time from interval events', () => {
    const instance = { exercises: [intervalsExercise] };
    const result = calculateSessionStats(instance, sampleIntervalEvents, baseSession);
    expect(result.cardio_time_min).toBe(3);
  });

  it('adds duration exercises from instance to cardio time', () => {
    const instance = { exercises: [durationExercise] };
    const result = calculateSessionStats(instance, [], baseSession);
    expect(result.cardio_time_min).toBe(10);
  });

  it('combines interval events and duration exercises for cardio time', () => {
    const instance = { exercises: [durationExercise, intervalsExercise] };
    const result = calculateSessionStats(instance, sampleIntervalEvents, baseSession);
    expect(result.cardio_time_min).toBe(13);
  });

  it('calculates workout duration from session timestamps', () => {
    const result = calculateSessionStats({ exercises: [] }, [], baseSession);
    expect(result.workout_duration_min).toBe(45);
  });

  it('returns null workout_duration_min when timestamps are missing', () => {
    const result = calculateSessionStats({ exercises: [] }, [], {});
    expect(result.workout_duration_min).toBe(null);
  });

  it('counts pain flags from safety events', () => {
    const instance = { exercises: [repsExercise] };
    const result = calculateSessionStats(instance, sampleSafetyEvents, baseSession);
    expect(result.pain_flags).toBe(1);
  });

  it('reads energy rating from session metadata', () => {
    const result = calculateSessionStats({ exercises: [] }, [], baseSession);
    expect(result.energy_rating).toBe(3);
  });

  it('returns null energy_rating when not in metadata', () => {
    const result = calculateSessionStats({ exercises: [] }, [], { metadata: {} });
    expect(result.energy_rating).toBe(null);
  });

  it('calculates exercises skipped as total minus those with logs', () => {
    const instance = { exercises: [repsExercise, holdExercise, durationExercise, intervalsExercise] };
    const result = calculateSessionStats(instance, sampleSetEvents, baseSession);
    expect(result.exercises_completed).toBe(2);
    expect(result.exercises_skipped).toBe(2);
  });

  it('handles null instance gracefully', () => {
    const result = calculateSessionStats(null, [], baseSession);
    expect(result.total_exercises).toBe(0);
    expect(result.exercises_completed).toBe(0);
  });

  it('handles undefined exercises array gracefully', () => {
    const result = calculateSessionStats({}, [], baseSession);
    expect(result.total_exercises).toBe(0);
  });
});

describe('getCurrentWeekBounds', () => {
  it('returns Monday and Sunday bounds', () => {
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getHours()).toBe(0);
    expect(weekEnd.getDay()).toBe(0);
    expect(weekEnd.getHours()).toBe(23);
  });
});

// ─── DB Operation Tests ──────────────────────────────────────────────

describe('calculateWeeklyStats', () => {
  const weekStart = new Date('2026-02-09T00:00:00Z');
  const weekEnd = new Date('2026-02-15T23:59:59Z');

  it('returns zeros when no sessions in range', async () => {
    mockChain.mockResolveWithCount([], 0);
    const result = await calculateWeeklyStats('user-1', weekStart, weekEnd);
    expect(result.sessions_completed).toBe(0);
    expect(result.total_reps).toBe(0);
    expect(result.total_volume).toBe(0);
    expect(result.avg_energy_rating).toBe(null);
    expect(result.avg_session_duration_min).toBe(null);
    expect(result.sessions_planned).toBe(0);
  });
});
