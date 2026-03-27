const {
  __testUtils
} = require('../../src/runtime/services/workout-state.service');

describe('workout-state service helpers', () => {
  it('sanitizes non-UUID exercise definition ids before persistence', () => {
    expect(__testUtils.resolveExerciseDefinitionId('db_bent_over_row')).toBeNull();
    expect(__testUtils.resolveExerciseDefinitionId('514b3826-4040-4d12-8c96-76f59741fdb8')).toBe(
      '514b3826-4040-4d12-8c96-76f59741fdb8'
    );
  });

  it('falls back to a symbolic key when the agent sends a slug-like exerciseId', () => {
    expect(__testUtils.buildExerciseKey({
      exerciseId: 'db_bent_over_row',
      exerciseName: 'DB Bent Over Row'
    })).toBe('db_bent_over_row');

    expect(__testUtils.buildExerciseKey({
      exerciseName: 'Bent Over Row'
    })).toBe('bent-over-row');
  });

  it('resolves the current exercise and symbolic exercise refs from a workout graph', () => {
    const graph = {
      session: {
        current_exercise_index: 1
      },
      exercises: [
        {
          workout_exercise_id: 'exercise-1',
          order_index: 0,
          status: 'completed',
          exercise_key: 'bench_press',
          exercise_name_normalized: 'bench press',
          exercise_name_raw: 'Bench Press'
        },
        {
          workout_exercise_id: 'exercise-2',
          order_index: 1,
          status: 'active',
          exercise_key: 'db_bent_over_row',
          exercise_name_normalized: 'db bent over row',
          exercise_name_raw: 'DB Bent Over Row'
        }
      ]
    };

    expect(__testUtils.findWorkoutExerciseRow(graph, 'current').workout_exercise_id).toBe('exercise-2');
    expect(__testUtils.findWorkoutExerciseRow(graph, 'db_bent_over_row').workout_exercise_id).toBe('exercise-2');
  });

  it('normalizes a single-date workout history request into an inclusive window', () => {
    expect(__testUtils.normalizeWorkoutHistoryWindow({
      date: '2026-03-27'
    })).toEqual({
      requestedMode: 'single_date',
      startDate: '2026-03-27',
      endDate: '2026-03-27',
      includeLiveSessions: false,
      maxSessions: 10
    });
  });

  it('builds UTC history bounds from local date keys across a DST boundary', () => {
    expect(__testUtils.buildUtcRangeForDateKeys({
      startDateKey: '2026-03-08',
      endDateKey: '2026-03-08',
      timezone: 'America/New_York'
    })).toEqual({
      startIso: '2026-03-08T05:00:00Z',
      endExclusiveIso: '2026-03-09T04:00:00Z'
    });
  });

  it('prefers completed timestamps when assigning a history date to a session', () => {
    expect(__testUtils.getWorkoutHistoryReferenceTimestamp({
      created_at: '2026-03-27T11:00:00Z',
      started_at: '2026-03-27T12:00:00Z',
      completed_at: '2026-03-27T13:00:00Z'
    })).toBe('2026-03-27T13:00:00Z');
  });
});
