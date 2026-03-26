const {
  parseWorkoutGenerateToolInput,
  workoutRewriteRemainingToolInputSchema
} = require('../../src/runtime/schemas/workout-tool-contracts.schema');

describe('workout tool contracts', () => {
  it('accepts an agent-authored workout generation payload', () => {
    const parsed = parseWorkoutGenerateToolInput({
      title: 'Lower Body Strength',
      guidance: {
        origin: 'quick_action',
        timeCapMinutes: 40,
        equipment: ['barbell', 'rack'],
        constraints: ['keep it knee-friendly']
      },
      summary: {
        coachSummary: 'We are keeping today crisp and strength-focused.',
        agentSummary: 'Reduced volume slightly because the user reported fatigue.'
      },
      decision: {
        decisionType: 'initial_generation',
        rationale: 'Build a lower-body strength day around the user being ready to train now.',
        userSignal: 'start workout',
        constraintsConsidered: ['40 minute cap', 'knee-friendly'],
        preserveCompletedWork: true
      },
      exercises: [
        {
          orderIndex: 0,
          exerciseKey: 'barbell-box-squat',
          exerciseName: 'Barbell Box Squat',
          displayName: 'Box Squat',
          coachMessage: 'Own the descent and stay tight.',
          prescription: {
            trackingMode: 'reps_load',
            blockLabel: 'Main lift',
            selectionReason: 'Safer squat pattern for today',
            restSec: 120
          },
          sets: [
            {
              setIndex: 0,
              target: {
                reps: 5,
                loadPrescription: {
                  mode: 'exact',
                  value: 135,
                  unit: 'lb'
                }
              }
            }
          ]
        }
      ],
      startMode: 'preview'
    });

    expect(parsed.decision.decisionType).toBe('initial_generation');
    expect(parsed.exercises[0].prescription.selectionReason).toBe('Safer squat pattern for today');
  });

  it('accepts a rewrite of the remaining workout plan after a live adjustment', () => {
    const parsed = workoutRewriteRemainingToolInputSchema.parse({
      workoutSessionId: 'workout-1',
      decision: {
        decisionType: 'difficulty_response',
        rationale: 'Lower the demand after the user reported the current work is too hard.',
        userSignal: 'too hard'
      },
      remainingExercises: [
        {
          orderIndex: 1,
          exerciseName: 'Goblet Squat',
          displayName: 'Goblet Squat',
          prescription: {
            trackingMode: 'reps_only',
            adaptationReason: 'Swapped to an easier squat pattern'
          },
          sets: [
            {
              setIndex: 0,
              target: {
                repRange: {
                  min: 8,
                  max: 10
                },
                instruction: 'Stop 2 reps before failure'
              }
            }
          ]
        }
      ],
      flow: {
        currentPhase: 'exercise',
        currentExerciseIndex: 1,
        currentSetIndex: 0
      }
    });

    expect(parsed.remainingExercises[0].prescription.adaptationReason).toBe('Swapped to an easier squat pattern');
  });
});
