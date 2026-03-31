const mockEnqueueAgentRunTurn = jest.fn();
const mockPersistInboundMessage = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockAcquireSessionMutationLock = jest.fn();
const mockReleaseSessionMutationLock = jest.fn();
const mockAppendSessionEvent = jest.fn();
const mockRecordWorkoutSetResult = jest.fn();
const mockRpc = jest.fn();
const mockResolveEffectiveLlmSelection = jest.fn().mockResolvedValue({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6'
});

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
  SessionMutationLockBusyError: class SessionMutationLockBusyError extends Error {},
  acquireSessionMutationLock: mockAcquireSessionMutationLock,
  releaseSessionMutationLock: mockReleaseSessionMutationLock
}));

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: mockAppendSessionEvent
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  recordWorkoutSetResult: mockRecordWorkoutSetResult
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    rpc: mockRpc
  }))
}));

jest.mock('../../src/runtime/services/llm-config.service', () => ({
  resolveEffectiveLlmSelection: mockResolveEffectiveLlmSelection
}));

const { processCompleteCurrentSetAction } = require('../../src/gateway/services/workout-actions.service');

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

describe('processCompleteCurrentSetAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveSessionContinuityPolicy.mockResolvedValue({
      timezone: 'America/New_York',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240
    });
    mockRpc.mockResolvedValue({
      data: {
        sessionId: 'session-123',
        sessionKey: 'user:user-123:main'
      },
      error: null
    });
    mockAcquireSessionMutationLock.mockResolvedValue({
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
  });

  it('completes the live set immediately and queues a hidden follow-up run', async () => {
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

    const result = await processCompleteCurrentSetAction({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        setIndex: 1,
        expectedStateVersion: 7
      }
    });

    expect(mockRecordWorkoutSetResult).toHaveBeenCalledWith({
      userId: 'user-123',
      input: expect.objectContaining({
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        setIndex: 1,
        expectedStateVersion: 7,
        resultStatus: 'completed'
      })
    });
    expect(mockAppendSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'workout.set.completed.ui_action'
    }));
    expect(mockPersistInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      route: '/internal/workout-actions/complete-current-set/follow-up',
      triggerType: 'ui.action.complete_set',
      metadata: expect.objectContaining({
        hiddenInFeed: true,
        actionId: 'complete_current_set',
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6'
        }
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      status: 'ok',
      workout: expect.objectContaining({
        workoutSessionId: 'workout-1',
        currentSetIndex: 2
      }),
      appliedStateVersion: 8,
      agentFollowUp: {
        status: 'queued',
        runId: 'run-follow-up-1',
        streamUrl: '/v1/runs/run-follow-up-1/stream',
        jobId: 'job-follow-up-1'
      }
    }));
    expect(mockReleaseSessionMutationLock).toHaveBeenCalled();
  });
});
