const { parseWorkoutSessionState } = require('../../src/runtime/schemas/workout.schema');

describe('parseWorkoutSessionState', () => {
  it('accepts a structured live workout session', () => {
    const parsed = parseWorkoutSessionState({
      workoutSessionId: 'workout-1',
      sessionKey: 'user:123:main',
      stateVersion: 3,
      status: 'in_progress',
      currentPhase: 'exercise',
      title: 'Lower Body Strength',
      guidance: {
        origin: 'quick_action',
        timeCapMinutes: 45,
        equipment: ['barbell', 'bench'],
        readiness: {
          energy: 'medium',
          soreness: 'low'
        },
        source: {
          triggerType: 'ui.action.start_workout',
          runId: 'run-123'
        }
      },
      summary: {
        estimatedDurationMinutes: 42
      },
      currentExerciseIndex: 0,
      currentSetIndex: 1,
      startedAt: '2026-03-23T12:00:00.000Z',
      completedAt: null,
      currentExerciseId: 'exercise-instance-1',
      progress: {
        completedExercises: 0,
        totalExercises: 3,
        completedSets: 1,
        totalSets: 9,
        remainingExercises: 3
      },
      exercises: [
        {
          workoutExerciseId: 'exercise-instance-1',
          workoutSessionId: 'workout-1',
          orderIndex: 0,
          exerciseId: 'exercise-def-1',
          exerciseKey: 'barbell-back-squat',
          exerciseName: 'Barbell Back Squat',
          displayName: 'Back Squat',
          status: 'active',
          prescription: {
            trackingMode: 'reps_load',
            blockLabel: 'Main lift',
            restSec: 120,
            selectionReason: 'Best fit for lower-body strength today',
            coachingCues: ['Brace before every rep']
          },
          coachMessage: 'Smooth tempo on the way down.',
          startedAt: '2026-03-23T12:00:00.000Z',
          completedAt: null,
          sets: [
            {
              workoutSetId: 'set-1',
              setIndex: 0,
              status: 'completed',
              target: {
                reps: 5,
                repRange: {
                  min: 5,
                  max: 6
                },
                load: {
                  value: 135,
                  unit: 'lb'
                },
                loadPrescription: {
                  mode: 'relative_change',
                  delta: 5,
                  unit: 'lb',
                  text: 'Go up 5 lb if bar speed stays good'
                },
                restSec: 120
              },
              actual: {
                reps: 5,
                load: {
                  value: 135,
                  unit: 'lb'
                },
                rpe: 7
              },
              completedAt: '2026-03-23T12:05:00.000Z'
            }
          ],
          adjustments: [
            {
              workoutExerciseId: 'exercise-instance-1',
              setIndex: 1,
              adjustmentType: 'adjust_load',
              source: 'ui_action',
              reason: 'User tapped add weight',
              after: {
                load: 140
              },
              createdAt: '2026-03-23T12:06:00.000Z'
            }
          ]
        }
      ]
    });

    expect(parsed.currentPhase).toBe('exercise');
    expect(parsed.exercises[0].prescription.trackingMode).toBe('reps_load');
    expect(parsed.exercises[0].sets[0].target.load.value).toBe(135);
    expect(parsed.exercises[0].sets[0].target.loadPrescription.mode).toBe('relative_change');
  });

  it('rejects a workout session without progress counts', () => {
    expect(() => parseWorkoutSessionState({
      workoutSessionId: 'workout-1',
      sessionKey: 'user:123:main',
      status: 'queued',
      currentPhase: 'preview',
      exercises: []
    })).toThrow();
  });
});
