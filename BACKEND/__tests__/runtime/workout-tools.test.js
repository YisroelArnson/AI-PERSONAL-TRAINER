const mockAppendSessionEvent = jest.fn().mockResolvedValue();
const mockAdjustWorkoutSetTargets = jest.fn();
const mockCreateWorkoutSessionFromDraft = jest.fn();
const mockFinishWorkoutSession = jest.fn();
const mockRecordWorkoutSetResult = jest.fn();
const mockReplaceWorkoutExerciseFromDraft = jest.fn();
const mockRewriteRemainingWorkoutFromDraft = jest.fn();

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  adjustWorkoutSetTargets: mockAdjustWorkoutSetTargets,
  createWorkoutSessionFromDraft: mockCreateWorkoutSessionFromDraft,
  finishWorkoutSession: mockFinishWorkoutSession,
  recordWorkoutSetResult: mockRecordWorkoutSetResult,
  replaceWorkoutExerciseFromDraft: mockReplaceWorkoutExerciseFromDraft,
  rewriteRemainingWorkoutFromDraft: mockRewriteRemainingWorkoutFromDraft
}));

const workoutAdjustSetTargetsTool = require('../../src/runtime/trainer-tools/handlers/workout-adjust-set-targets.tool');
const workoutFinishSessionTool = require('../../src/runtime/trainer-tools/handlers/workout-finish-session.tool');
const workoutGenerateTool = require('../../src/runtime/trainer-tools/handlers/workout-generate.tool');
const workoutRecordSetResultTool = require('../../src/runtime/trainer-tools/handlers/workout-record-set-result.tool');
const workoutReplaceExerciseTool = require('../../src/runtime/trainer-tools/handlers/workout-replace-exercise.tool');
const workoutRewriteRemainingTool = require('../../src/runtime/trainer-tools/handlers/workout-rewrite-remaining.tool');

describe('workout tool handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a workout from an agent-authored draft', async () => {
    mockCreateWorkoutSessionFromDraft.mockResolvedValue({
      workoutSessionId: 'workout-1',
      title: 'Lower Body Strength',
      currentPhase: 'preview',
      exercises: [
        {
          workoutExerciseId: 'exercise-1'
        }
      ]
    });

    const result = await workoutGenerateTool.execute({
      input: {
        title: 'Lower Body Strength',
        decision: {
          decisionType: 'initial_generation',
          rationale: 'User wants to start training now.'
        },
        exercises: [
          {
            orderIndex: 0,
            exerciseName: 'Box Squat',
            sets: [
              {
                setIndex: 0,
                target: {
                  reps: 5
                }
              }
            ]
          }
        ]
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.workoutSessionId).toBe('workout-1');
    expect(mockCreateWorkoutSessionFromDraft).toHaveBeenCalled();
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.generated'
    }));
  });

  it('returns a semantic error when a live workout already exists', async () => {
    const error = new Error('ACTIVE_WORKOUT_EXISTS');
    error.code = 'ACTIVE_WORKOUT_EXISTS';
    error.details = {
      workoutSessionId: 'workout-live-1'
    };
    mockCreateWorkoutSessionFromDraft.mockRejectedValue(error);

    const result = await workoutGenerateTool.execute({
      input: {
        decision: {
          decisionType: 'initial_generation',
          rationale: 'User asked to start.'
        },
        exercises: [
          {
            orderIndex: 0,
            exerciseName: 'Box Squat',
            sets: [
              {
                setIndex: 0,
                target: {}
              }
            ]
          }
        ]
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('semantic_error');
    expect(result.error.code).toBe('ACTIVE_WORKOUT_EXISTS');
  });

  it('records a set result and returns the updated workout', async () => {
    mockRecordWorkoutSetResult.mockResolvedValue({
      workout: {
        workoutSessionId: 'workout-1',
        currentPhase: 'exercise',
        currentExerciseId: 'exercise-1'
      }
    });

    const result = await workoutRecordSetResultTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        setIndex: 0,
        resultStatus: 'completed',
        decision: {
          decisionType: 'user_request',
          rationale: 'The user said they finished the set.'
        }
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.workoutSessionId).toBe('workout-1');
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.set.completed'
    }));
  });

  it('rewrites the remaining workout with a new agent-authored plan', async () => {
    mockRewriteRemainingWorkoutFromDraft.mockResolvedValue({
      workoutSessionId: 'workout-1',
      currentPhase: 'exercise',
      exercises: [
        {
          workoutExerciseId: 'exercise-2'
        }
      ]
    });

    const result = await workoutRewriteRemainingTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        decision: {
          decisionType: 'difficulty_response',
          rationale: 'The current plan is too difficult, so the remaining work was rewritten.'
        },
        remainingExercises: [
          {
            orderIndex: 1,
            exerciseName: 'Goblet Squat',
            sets: [
              {
                setIndex: 0,
                target: {
                  reps: 8
                }
              }
            ]
          }
        ]
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.workoutSessionId).toBe('workout-1');
    expect(mockRewriteRemainingWorkoutFromDraft).toHaveBeenCalled();
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.rewritten'
    }));
  });

  it('replaces one unfinished exercise in place', async () => {
    mockReplaceWorkoutExerciseFromDraft.mockResolvedValue({
      workoutSessionId: 'workout-1',
      currentPhase: 'exercise',
      exercises: [
        {
          workoutExerciseId: 'exercise-1'
        }
      ]
    });

    const result = await workoutReplaceExerciseTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        decision: {
          decisionType: 'equipment_constraint',
          rationale: 'No barbell is available, so the movement was swapped.'
        },
        replacement: {
          orderIndex: 0,
          exerciseName: 'Dumbbell Front Squat',
          sets: [
            {
              setIndex: 0,
              target: {
                reps: 8
              }
            }
          ]
        }
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.workoutSessionId).toBe('workout-1');
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.exercise.replaced'
    }));
  });

  it('returns a semantic error when replacing an exercise would overwrite history', async () => {
    const error = new Error('EXERCISE_ALREADY_STARTED');
    error.code = 'EXERCISE_ALREADY_STARTED';
    error.details = {
      workoutExerciseId: 'exercise-1'
    };
    mockReplaceWorkoutExerciseFromDraft.mockRejectedValue(error);

    const result = await workoutReplaceExerciseTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        decision: {
          decisionType: 'pain_response',
          rationale: 'The user felt pain on the original exercise.'
        },
        replacement: {
          orderIndex: 0,
          exerciseName: 'Leg Press',
          sets: [
            {
              setIndex: 0,
              target: {
                reps: 10
              }
            }
          ]
        }
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('semantic_error');
    expect(result.error.code).toBe('EXERCISE_ALREADY_STARTED');
  });

  it('adjusts the stored targets for unfinished sets', async () => {
    mockAdjustWorkoutSetTargets.mockResolvedValue({
      workoutSessionId: 'workout-1',
      currentPhase: 'exercise',
      currentExerciseId: 'exercise-1'
    });

    const result = await workoutAdjustSetTargetsTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        decision: {
          decisionType: 'difficulty_response',
          rationale: 'The user asked to reduce the remaining reps.'
        },
        setUpdates: [
          {
            setIndex: 1,
            target: {
              reps: 6
            },
            note: 'Reduce effort for the remaining work.'
          }
        ]
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.workoutSessionId).toBe('workout-1');
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.targets.adjusted'
    }));
  });

  it('finishes a workout session and returns the final state', async () => {
    mockFinishWorkoutSession.mockResolvedValue({
      workoutSessionId: 'workout-1',
      status: 'completed',
      currentPhase: 'finished'
    });

    const result = await workoutFinishSessionTool.execute({
      input: {
        workoutSessionId: 'workout-1',
        finalStatus: 'completed',
        decision: {
          decisionType: 'session_wrap_up',
          rationale: 'The workout is complete.'
        },
        summary: {
          agentSummary: 'Session completed successfully.'
        }
      },
      userId: 'user-123',
      run: {
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(result.output.workout.status).toBe('completed');
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.finished'
    }));
  });
});
