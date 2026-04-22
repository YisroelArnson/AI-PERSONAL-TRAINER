/**
 * File overview:
 * Contains automated tests for the workout tools behavior.
 *
 * Main functions in this file:
 * - buildWorkoutState: Builds a Workout state used by this file.
 * - applyFilters: Applies Filters to the current data.
 * - mockCreateSupabaseBuilder: Handles Mock create Supabase builder for workout-tools.test.js.
 */

const mockAppendSessionEvent = jest.fn().mockResolvedValue();
const mockAdjustWorkoutSetTargets = jest.fn();
const mockCreateWorkoutSessionFromDraft = jest.fn();
const mockFinishWorkoutSession = jest.fn();
const mockGetCurrentWorkoutState = jest.fn();
const mockGetWorkoutHistory = jest.fn();
const mockRecordWorkoutSetResult = jest.fn();
const mockReplaceWorkoutExerciseFromDraft = jest.fn();
const mockRewriteRemainingWorkoutFromDraft = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockAcquireWorkoutMutationLock = jest.fn();
const mockReleaseSessionMutationLock = jest.fn();
const mockResolveEffectiveLlmSelection = jest.fn().mockResolvedValue({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6'
});

let mockSupabaseState;
let mockRpc;

/**
 * Builds a Workout state used by this file.
 */
function buildWorkoutState(overrides = {}) {
  return {
    workoutSessionId: 'workout-1',
    sessionKey: 'user:123:main',
    stateVersion: 7,
    status: 'in_progress',
    currentPhase: 'exercise',
    title: 'Training Session',
    guidance: {
      origin: 'agent_generated',
      equipment: [],
      focusAreas: [],
      constraints: [],
      painFlags: [],
      readiness: {},
      source: {}
    },
    summary: {},
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    startedAt: '2026-03-25T10:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-03-25T10:02:00.000Z',
    currentExerciseId: 'exercise-1',
    progress: {
      completedExercises: 0,
      totalExercises: 1,
      completedSets: 0,
      totalSets: 1,
      remainingExercises: 1
    },
    exercises: [
      {
        workoutExerciseId: 'exercise-1',
        workoutSessionId: 'workout-1',
        orderIndex: 0,
        exerciseId: null,
        exerciseKey: 'db_row',
        exerciseName: 'DB Row',
        displayName: 'DB Row',
        status: 'active',
        prescription: {
          trackingMode: 'reps_load',
          equipment: [],
          tags: [],
          coachingCues: [],
          substitutionTags: []
        },
        coachMessage: null,
        startedAt: '2026-03-25T10:00:00.000Z',
        completedAt: null,
        adjustments: [],
        sets: [
          {
            workoutSetId: 'set-1',
            setIndex: 0,
            status: 'active',
            target: {
              reps: 8
            },
            actual: {},
            notes: null,
            startedAt: '2026-03-25T10:00:00.000Z',
            completedAt: null
          }
        ]
      }
    ],
    ...overrides
  };
}

/**
 * Applies Filters to the current data.
 */
function applyFilters(rows, ctx) {
  let result = rows;

  for (const predicate of ctx.filters) {
    result = result.filter(predicate);
  }

  if (ctx.order) {
    result = [...result].sort((left, right) => {
      const leftValue = left[ctx.order.column];
      const rightValue = right[ctx.order.column];

      if (leftValue === rightValue) {
        return 0;
      }

      const comparison = leftValue > rightValue ? 1 : -1;
      return ctx.order.ascending ? comparison : -comparison;
    });
  }

  if (Number.isInteger(ctx.limit)) {
    result = result.slice(0, ctx.limit);
  }

  return result;
}

/**
 * Handles Mock create Supabase builder for workout-tools.test.js.
 */
function mockCreateSupabaseBuilder(table) {
  const ctx = {
    filters: [],
    limit: null,
    order: null,
    mode: 'select',
    insertRows: null,
    updateValues: null
  };

  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      ctx.filters.push(row => row[column] === value);
      return builder;
    },
    in(column, values) {
      ctx.filters.push(row => values.includes(row[column]));
      return builder;
    },
    order(column, { ascending }) {
      ctx.order = {
        column,
        ascending
      };
      return builder;
    },
    limit(count) {
      ctx.limit = count;
      return builder;
    },
    insert(rows) {
      ctx.mode = 'insert';
      ctx.insertRows = Array.isArray(rows) ? rows : [rows];
      return builder;
    },
    update(values) {
      ctx.mode = 'update';
      ctx.updateValues = values;
      return builder;
    },
    async maybeSingle() {
      const result = await builder._execute();
      return {
        data: Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null),
        error: result.error
      };
    },
    async single() {
      const result = await builder._execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] : result.data,
        error: result.error
      };
    },
    async _execute() {
      if (table === 'workout_commands') {
        if (ctx.mode === 'insert') {
          const insertedRows = ctx.insertRows.map(row => ({
            ...row
          }));
          mockSupabaseState.workoutCommands.push(...insertedRows);
          return {
            data: insertedRows,
            error: null
          };
        }

        return {
          data: applyFilters(mockSupabaseState.workoutCommands, ctx),
          error: null
        };
      }

      if (table === 'workout_sessions') {
        if (ctx.mode === 'update') {
          const rows = applyFilters(mockSupabaseState.workoutSessions, ctx);
          rows.forEach(row => Object.assign(row, ctx.updateValues));
          return {
            data: rows,
            error: null
          };
        }

        return {
          data: applyFilters(mockSupabaseState.workoutSessions, ctx),
          error: null
        };
      }

      if (table === 'runs') {
        return {
          data: applyFilters(mockSupabaseState.runs, ctx),
          error: null
        };
      }

      throw new Error(`Unexpected Supabase table: ${table}`);
    },
    then(resolve, reject) {
      return builder._execute().then(resolve, reject);
    }
  };

  return builder;
}

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  adjustWorkoutSetTargets: mockAdjustWorkoutSetTargets,
  createWorkoutSessionFromDraft: mockCreateWorkoutSessionFromDraft,
  finishWorkoutSession: mockFinishWorkoutSession,
  getCurrentWorkoutState: mockGetCurrentWorkoutState,
  getWorkoutHistory: mockGetWorkoutHistory,
  recordWorkoutSetResult: mockRecordWorkoutSetResult,
  replaceWorkoutExerciseFromDraft: mockReplaceWorkoutExerciseFromDraft,
  rewriteRemainingWorkoutFromDraft: mockRewriteRemainingWorkoutFromDraft
}));

jest.mock('../../src/runtime/services/session-reset-policy.service', () => ({
  resolveSessionContinuityPolicy: mockResolveSessionContinuityPolicy
}));

jest.mock('../../src/runtime/services/session-mutation-lock.service', () => ({
  WorkoutMutationLockBusyError: class WorkoutMutationLockBusyError extends Error {
    constructor(message = 'busy') {
      super(message);
      this.code = 'WORKOUT_MUTATION_LOCK_BUSY';
    }
  },
  acquireWorkoutMutationLock: mockAcquireWorkoutMutationLock,
  releaseSessionMutationLock: mockReleaseSessionMutationLock
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    rpc: (...args) => mockRpc(...args),
    from: table => mockCreateSupabaseBuilder(table)
  }))
}));

jest.mock('../../src/runtime/services/llm-config.service', () => ({
  resolveEffectiveLlmSelection: mockResolveEffectiveLlmSelection
}));

const workoutAdjustSetTargetsTool = require('../../src/runtime/trainer-tools/handlers/workout-adjust-set-targets.tool');
const workoutFinishSessionTool = require('../../src/runtime/trainer-tools/handlers/workout-finish-session.tool');
const workoutGenerateTool = require('../../src/runtime/trainer-tools/handlers/workout-generate.tool');
const workoutHistoryFetchTool = require('../../src/runtime/trainer-tools/handlers/workout-history-fetch.tool');
const workoutRecordSetResultTool = require('../../src/runtime/trainer-tools/handlers/workout-record-set-result.tool');
const workoutReplaceExerciseTool = require('../../src/runtime/trainer-tools/handlers/workout-replace-exercise.tool');
const workoutRewriteRemainingTool = require('../../src/runtime/trainer-tools/handlers/workout-rewrite-remaining.tool');

describe('workout tool handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabaseState = {
      workoutCommands: [],
      runs: [],
      workoutSessions: [
        {
          user_id: 'user-123',
          workout_session_id: 'workout-1',
          last_command_sequence: 0
        }
      ]
    };
    mockRpc = jest.fn().mockResolvedValue({
      data: {
        sessionId: 'session-123',
        sessionKey: 'user:123:main'
      },
      error: null
    });
    mockResolveSessionContinuityPolicy.mockResolvedValue({
      timezone: 'America/New_York',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240
    });
    mockGetCurrentWorkoutState.mockResolvedValue(buildWorkoutState());
    mockAcquireWorkoutMutationLock.mockResolvedValue({
      acquired: true,
      enforced: false
    });
    mockReleaseSessionMutationLock.mockResolvedValue();
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
      workout: buildWorkoutState({
        stateVersion: 8
      })
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
      eventType: 'workout.command.applied'
    }));
  });

  it('fetches structured workout history for an inclusive date range', async () => {
    mockGetWorkoutHistory.mockResolvedValue({
      timezone: 'America/New_York',
      window: {
        requestedMode: 'date_range',
        startDate: '2026-03-20',
        endDate: '2026-03-26',
        includeLiveSessions: false,
        maxSessions: 10,
        returnedSessions: 1,
        hasMore: false
      },
      summary: {
        totalSessions: 1,
        statusCounts: {
          completed: 1
        },
        totalExercises: 2,
        completedExercises: 2,
        totalSets: 6,
        completedSets: 6
      },
      sessions: [
        {
          sessionDate: '2026-03-24',
          referenceTimestamp: '2026-03-24T13:00:00Z',
          workout: {
            workoutSessionId: 'workout-1',
            status: 'completed',
            progress: {
              totalExercises: 2,
              completedExercises: 2,
              totalSets: 6,
              completedSets: 6
            }
          }
        }
      ]
    });

    const result = await workoutHistoryFetchTool.execute({
      input: {
        startDate: '2026-03-20',
        endDate: '2026-03-26'
      },
      userId: 'user-123'
    });

    expect(result.status).toBe('ok');
    expect(result.output.history.summary.totalSessions).toBe(1);
    expect(mockGetWorkoutHistory).toHaveBeenCalledWith({
      userId: 'user-123',
      input: {
        startDate: '2026-03-20',
        endDate: '2026-03-26'
      }
    });
  });

  it('returns a validation error for an inverted workout history range', async () => {
    const result = await workoutHistoryFetchTool.execute({
      input: {
        startDate: '2026-03-26',
        endDate: '2026-03-20'
      },
      userId: 'user-123'
    });

    expect(result.status).toBe('validation_error');
    expect(result.error.explanation).toContain('startDate must be on or before endDate');
    expect(mockGetWorkoutHistory).not.toHaveBeenCalled();
  });

  it('rewrites the remaining workout with a new agent-authored plan', async () => {
    mockRewriteRemainingWorkoutFromDraft.mockResolvedValue(buildWorkoutState({
      stateVersion: 8,
      exercises: [
        {
          ...buildWorkoutState().exercises[0],
          workoutExerciseId: 'exercise-2',
          workoutSessionId: 'workout-1',
          exerciseName: 'Goblet Squat',
          displayName: 'Goblet Squat'
        }
      ]
    }));

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
      eventType: 'workout.command.applied'
    }));
  });

  it('replaces one unfinished exercise in place', async () => {
    mockReplaceWorkoutExerciseFromDraft.mockResolvedValue(buildWorkoutState({
      stateVersion: 8
    }));

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
      eventType: 'workout.command.applied'
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
    mockAdjustWorkoutSetTargets.mockResolvedValue(buildWorkoutState({
      stateVersion: 8
    }));

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
      eventType: 'workout.command.applied'
    }));
  });

  it('finishes a workout session and returns the final state', async () => {
    mockFinishWorkoutSession.mockResolvedValue(buildWorkoutState({
      stateVersion: 8,
      status: 'completed',
      currentPhase: 'finished',
      currentExerciseIndex: null,
      currentSetIndex: null,
      currentExerciseId: null,
      completedAt: '2026-03-25T10:10:00.000Z',
      progress: {
        completedExercises: 1,
        totalExercises: 1,
        completedSets: 1,
        totalSets: 1,
        remainingExercises: 0
      },
      exercises: [
        {
          ...buildWorkoutState().exercises[0],
          status: 'completed',
          completedAt: '2026-03-25T10:10:00.000Z',
          sets: [
            {
              ...buildWorkoutState().exercises[0].sets[0],
              status: 'completed',
              completedAt: '2026-03-25T10:09:00.000Z'
            }
          ]
        }
      ]
    }));

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
      eventType: 'workout.command.applied'
    }));
  });
});
