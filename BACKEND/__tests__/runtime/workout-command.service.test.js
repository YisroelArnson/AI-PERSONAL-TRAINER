/**
 * File overview:
 * Contains automated tests for the workout command service behavior.
 *
 * Main functions in this file:
 * - buildWorkoutState: Builds a Workout state used by this file.
 * - applyFilters: Applies Filters to the current data.
 * - mockCreateSupabaseBuilder: Handles Mock create Supabase builder for workout-command.service.test.js.
 */

const mockEnqueueAgentRunTurn = jest.fn();
const mockPersistInboundMessage = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockAcquireWorkoutMutationLock = jest.fn();
const mockReleaseSessionMutationLock = jest.fn();
const mockAppendSessionEvent = jest.fn();
const mockGetCurrentWorkoutState = jest.fn();
const mockRecordWorkoutSetResult = jest.fn();
const mockStartWorkoutSession = jest.fn();
const mockSkipWorkoutExercise = jest.fn();
const mockPauseWorkoutSession = jest.fn();
const mockResumeWorkoutSession = jest.fn();
const mockFinishWorkoutSession = jest.fn();
const mockAdjustWorkoutSetTargets = jest.fn();
const mockReplaceWorkoutExerciseFromDraft = jest.fn();
const mockRewriteRemainingWorkoutFromDraft = jest.fn();
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
    sessionKey: 'user:user-123:main',
    stateVersion: 7,
    status: 'in_progress',
    currentPhase: 'exercise',
    title: 'Day B — Upper Body',
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
    currentSetIndex: 1,
    startedAt: '2026-03-25T10:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-03-25T10:02:00.000Z',
    currentExerciseId: 'exercise-1',
    progress: {
      completedExercises: 0,
      totalExercises: 1,
      completedSets: 1,
      totalSets: 3,
      remainingExercises: 1
    },
    exercises: [
      {
        workoutExerciseId: 'exercise-1',
        workoutSessionId: 'workout-1',
        orderIndex: 0,
        exerciseId: null,
        exerciseKey: 'db_single_arm_row',
        exerciseName: 'DB Single-Arm Row',
        displayName: 'DB Single-Arm Row',
        status: 'active',
        prescription: {
          trackingMode: 'reps_load',
          equipment: [],
          tags: [],
          coachingCues: [],
          substitutionTags: []
        },
        coachMessage: 'Keep your back flat.',
        startedAt: '2026-03-25T10:00:00.000Z',
        completedAt: null,
        adjustments: [],
        sets: [
          {
            workoutSetId: 'set-0',
            setIndex: 0,
            status: 'completed',
            target: {
              reps: 10,
              load: {
                value: 15,
                unit: 'lb'
              },
              restSec: 60
            },
            actual: {},
            notes: null,
            startedAt: '2026-03-25T10:00:00.000Z',
            completedAt: '2026-03-25T10:01:00.000Z'
          },
          {
            workoutSetId: 'set-1',
            setIndex: 1,
            status: 'active',
            target: {
              reps: 10,
              load: {
                value: 15,
                unit: 'lb'
              },
              restSec: 60
            },
            actual: {},
            notes: null,
            startedAt: '2026-03-25T10:02:00.000Z',
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
 * Handles Mock create Supabase builder for workout-command.service.test.js.
 */
function mockCreateSupabaseBuilder(table) {
  const ctx = {
    filters: [],
    limit: null,
    order: null,
    mode: 'select',
    selectColumns: '*',
    insertRows: null,
    updateValues: null
  };

  const builder = {
    select(columns) {
      ctx.selectColumns = columns;
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

jest.mock('../../src/infra/queue/agent.queue', () => ({
  enqueueAgentRunTurn: mockEnqueueAgentRunTurn
}));

jest.mock('../../src/runtime/services/gateway-ingest.service', () => ({
  persistInboundMessage: mockPersistInboundMessage
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

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  adjustWorkoutSetTargets: mockAdjustWorkoutSetTargets,
  finishWorkoutSession: mockFinishWorkoutSession,
  getCurrentWorkoutState: mockGetCurrentWorkoutState,
  pauseWorkoutSession: mockPauseWorkoutSession,
  recordWorkoutSetResult: mockRecordWorkoutSetResult,
  replaceWorkoutExerciseFromDraft: mockReplaceWorkoutExerciseFromDraft,
  resumeWorkoutSession: mockResumeWorkoutSession,
  rewriteRemainingWorkoutFromDraft: mockRewriteRemainingWorkoutFromDraft,
  skipWorkoutExercise: mockSkipWorkoutExercise,
  startWorkoutSession: mockStartWorkoutSession
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

const {
  executeWorkoutCommand
} = require('../../src/runtime/services/workout-command.service');

describe('executeWorkoutCommand', () => {
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
        sessionKey: 'user:user-123:main'
      },
      error: null
    });
    mockResolveSessionContinuityPolicy.mockResolvedValue({
      timezone: 'America/New_York',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240
    });
    mockAcquireWorkoutMutationLock.mockResolvedValue({
      acquired: true,
      enforced: false
    });
    mockReleaseSessionMutationLock.mockResolvedValue();
    mockAppendSessionEvent.mockResolvedValue();
    mockPersistInboundMessage.mockResolvedValue({
      runId: 'run-follow-up-1',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123'
    });
    mockEnqueueAgentRunTurn.mockResolvedValue({
      jobId: 'job-follow-up-1'
    });
    mockGetCurrentWorkoutState.mockResolvedValue(buildWorkoutState());
  });

  it('accepts an intermediate user set completion without queueing follow-up', async () => {
    const workoutAfter = buildWorkoutState({
      stateVersion: 8,
      currentSetIndex: 2,
      progress: {
        completedExercises: 0,
        totalExercises: 1,
        completedSets: 2,
        totalSets: 3,
        remainingExercises: 1
      }
    });

    mockRecordWorkoutSetResult.mockResolvedValue({
      workout: workoutAfter
    });

    const result = await executeWorkoutCommand({
      userId: 'user-123',
      headers: {
        'idempotency-key': 'idem-123'
      },
      command: {
        commandId: 'command-1',
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1',
        commandType: 'set.complete',
        origin: {
          actor: 'user_ui',
          deviceId: 'device-1',
          occurredAt: '2026-04-12T10:00:00.000Z'
        },
        baseStateVersion: 7,
        clientSequence: 1,
        payload: {
          workoutExerciseId: 'exercise-1',
          setIndex: 1
        }
      }
    });

    expect(result.command.status).toBe('accepted');
    expect(result.command.resolution).toBe('applied');
    expect(result.command.serverSequence).toBe(1);
    expect(result.workout.stateVersion).toBe(8);
    expect(result.agentFollowUp.status).toBe('not_queued');
    expect(mockPersistInboundMessage).not.toHaveBeenCalled();
    expect(mockAppendSessionEvent).toHaveBeenCalledTimes(1);
  });

  it('queues a background follow-up when a user completion finishes the exercise', async () => {
    const workoutAfter = buildWorkoutState({
      stateVersion: 8,
      currentExerciseIndex: null,
      currentSetIndex: null,
      currentExerciseId: null,
      status: 'completed',
      currentPhase: 'finished',
      progress: {
        completedExercises: 1,
        totalExercises: 1,
        completedSets: 2,
        totalSets: 2,
        remainingExercises: 0
      },
      exercises: [
        {
          ...buildWorkoutState().exercises[0],
          status: 'completed',
          sets: [
            buildWorkoutState().exercises[0].sets[0],
            {
              ...buildWorkoutState().exercises[0].sets[1],
              status: 'completed',
              completedAt: '2026-03-25T10:03:00.000Z'
            }
          ]
        }
      ]
    });

    mockRecordWorkoutSetResult.mockResolvedValue({
      workout: workoutAfter
    });

    const result = await executeWorkoutCommand({
      userId: 'user-123',
      headers: {
        'idempotency-key': 'idem-123'
      },
      command: {
        commandId: 'command-2',
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1',
        commandType: 'set.complete',
        origin: {
          actor: 'user_ui',
          deviceId: 'device-1',
          occurredAt: '2026-04-12T10:00:00.000Z'
        },
        baseStateVersion: 7,
        clientSequence: 2,
        payload: {
          workoutExerciseId: 'exercise-1',
          setIndex: 1
        }
      }
    });

    expect(result.command.status).toBe('accepted');
    expect(result.agentFollowUp.status).toBe('queued');
    expect(result.agentFollowUp.deliveryMode).toBe('background');
    expect(mockPersistInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      route: '/internal/workout-commands/set-complete/follow-up'
    }));
  });

  it('suppresses a background follow-up when another run is already active on the same session', async () => {
    const workoutAfter = buildWorkoutState({
      stateVersion: 8,
      status: 'completed',
      currentPhase: 'finished'
    });

    mockSupabaseState.runs.push({
      run_id: 'run-active-1',
      user_id: 'user-123',
      session_key: 'user:user-123:main',
      session_id: 'session-123',
      status: 'running'
    });
    mockFinishWorkoutSession.mockResolvedValue(workoutAfter);

    const result = await executeWorkoutCommand({
      userId: 'user-123',
      headers: {
        'idempotency-key': 'idem-123'
      },
      command: {
        commandId: 'command-3',
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1',
        commandType: 'session.finish',
        origin: {
          actor: 'user_ui',
          deviceId: 'device-1',
          occurredAt: '2026-04-12T10:00:00.000Z'
        },
        baseStateVersion: 7,
        clientSequence: 3,
        payload: {
          finalStatus: 'completed',
          summary: {}
        }
      }
    });

    expect(result.command.status).toBe('accepted');
    expect(result.agentFollowUp).toEqual({
      status: 'not_queued',
      deliveryMode: 'background',
      runId: null,
      streamUrl: null,
      jobId: null
    });
    expect(mockPersistInboundMessage).not.toHaveBeenCalled();
    expect(mockEnqueueAgentRunTurn).not.toHaveBeenCalled();
  });

  it('rejects a stale agent command when a newer user command already applied', async () => {
    mockSupabaseState.workoutCommands.push({
      command_id: 'user-command-1',
      user_id: 'user-123',
      session_key: 'user:user-123:main',
      workout_session_id: 'workout-1',
      origin_actor: 'user_ui',
      server_sequence: 3,
      status: 'accepted',
      resolution: 'applied',
      applied_at: '2026-04-12T10:05:00.000Z',
      conflict_metadata: {},
      result_workout: buildWorkoutState({
        stateVersion: 9
      }),
      applied_state_version: 9,
      agent_follow_up: {}
    });
    mockSupabaseState.workoutSessions[0].last_command_sequence = 3;
    mockGetCurrentWorkoutState.mockResolvedValue(
      buildWorkoutState({
        stateVersion: 9
      })
    );

    const result = await executeWorkoutCommand({
      userId: 'user-123',
      command: {
        commandId: 'agent-command-1',
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1',
        commandType: 'session.pause',
        origin: {
          actor: 'agent',
          runId: 'run-123',
          occurredAt: '2026-04-12T10:00:00.000Z'
        },
        baseStateVersion: 7,
        payload: {}
      },
      runContext: {
        runId: 'run-123',
        sessionId: 'session-123',
        sessionKey: 'user:user-123:main',
        createdAt: '2026-04-12T10:00:00.000Z'
      }
    });

    expect(result.command.status).toBe('rejected');
    expect(result.command.resolution).toBe('stale');
    expect(result.command.conflict).toEqual(expect.objectContaining({
      winner: 'user_ui',
      latestStateVersion: 9
    }));
    expect(mockPauseWorkoutSession).not.toHaveBeenCalled();
  });
});
