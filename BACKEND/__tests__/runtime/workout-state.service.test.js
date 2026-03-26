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
});
