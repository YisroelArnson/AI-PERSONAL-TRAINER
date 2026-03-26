const { buildWorkoutSurfaceDecorations } = require('../../src/runtime/services/coach-surface-card-renderer.service');

function buildBaseWorkout(overrides = {}) {
  return {
    workoutSessionId: 'workout-1',
    sessionKey: 'user:123:main',
    status: 'in_progress',
    currentPhase: 'exercise',
    title: 'Lower Body Strength',
    guidance: {},
    summary: {},
    currentExerciseIndex: 0,
    currentSetIndex: 1,
    startedAt: '2026-03-23T12:00:00.000Z',
    completedAt: null,
    currentExerciseId: 'exercise-1',
    progress: {
      completedExercises: 0,
      totalExercises: 2,
      completedSets: 1,
      totalSets: 6,
      remainingExercises: 2
    },
    exercises: [
      {
        workoutExerciseId: 'exercise-1',
        workoutSessionId: 'workout-1',
        orderIndex: 0,
        exerciseId: null,
        exerciseKey: 'back-squat',
        exerciseName: 'Back Squat',
        displayName: 'Back Squat',
        status: 'active',
        prescription: {
          restSec: 120,
          coachingCues: ['Brace before you descend.']
        },
        coachMessage: 'Stay braced and drive up hard.',
        startedAt: '2026-03-23T12:00:00.000Z',
        completedAt: null,
        adjustments: [],
        sets: [
          {
            workoutSetId: 'set-1',
            setIndex: 0,
            status: 'completed',
            target: {
              reps: 5,
              load: {
                value: 135,
                unit: 'lb'
              },
              restSec: 120
            },
            actual: {},
            notes: null,
            startedAt: '2026-03-23T12:00:00.000Z',
            completedAt: '2026-03-23T12:01:00.000Z'
          },
          {
            workoutSetId: 'set-2',
            setIndex: 1,
            status: 'active',
            target: {
              reps: 5,
              load: {
                value: 135,
                unit: 'lb'
              },
              restSec: 120
            },
            actual: {},
            notes: null,
            startedAt: '2026-03-23T12:02:00.000Z',
            completedAt: null
          }
        ]
      }
    ],
    ...overrides
  };
}

describe('buildWorkoutSurfaceDecorations', () => {
  it('builds a pinned current-workout card for a live session', () => {
    const result = buildWorkoutSurfaceDecorations({
      workout: buildBaseWorkout(),
      activeRun: {
        runId: 'run-123'
      }
    });

    expect(result.pinnedCard).toEqual({
      feedItemId: 'workout:workout-1:current',
      reason: 'active_workout',
      placement: 'above_composer'
    });
    expect(result.feedItems).toHaveLength(1);
    expect(result.feedItems[0]).toEqual(expect.objectContaining({
      id: 'workout:workout-1:current',
      kind: 'card',
      eventType: 'workout.card.current',
      runId: 'run-123'
    }));
    expect(result.feedItems[0].card).toEqual(expect.objectContaining({
      type: 'workout_current',
      currentExerciseName: 'Back Squat',
      currentSetLabel: 'Set 2 of 2 • 5 reps • @ 135 lb',
      progressLabel: '1 of 6 sets done'
    }));
    expect(result.feedItems[0].card.actions.map(action => action.id)).toEqual([
      'complete_set',
      'too_hard',
      'swap_exercise'
    ]);
    expect(result.feedItems[0].card.actions[0]).toEqual(expect.objectContaining({
      actionType: 'complete_current_set',
      triggerType: 'ui.action.complete_set'
    }));
  });

  it('builds an unpinned workout summary card for a finished session', () => {
    const result = buildWorkoutSurfaceDecorations({
      workout: buildBaseWorkout({
        status: 'completed',
        currentPhase: 'finished',
        completedAt: '2026-03-23T12:45:00.000Z',
        summary: {
          coachSummary: 'Solid session today.',
          agentSummary: 'Kept the plan consistent.',
          adaptationSummary: 'No changes needed.'
        }
      }),
      activeRun: null
    });

    expect(result.pinnedCard).toBeNull();
    expect(result.feedItems).toHaveLength(1);
    expect(result.feedItems[0]).toEqual(expect.objectContaining({
      id: 'workout:workout-1:summary',
      eventType: 'workout.card.summary'
    }));
    expect(result.feedItems[0].card).toEqual(expect.objectContaining({
      type: 'workout_summary',
      title: 'Lower Body Strength',
      highlights: [
        'Solid session today.',
        'Kept the plan consistent.',
        'No changes needed.'
      ]
    }));
  });
});
