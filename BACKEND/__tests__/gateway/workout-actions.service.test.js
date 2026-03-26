const mockEnqueueAgentRunTurn = jest.fn();
const mockPersistInboundMessage = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockAcquireSessionMutationLock = jest.fn();
const mockReleaseSessionMutationLock = jest.fn();
const mockAppendSessionEvent = jest.fn();
const mockBuildCoachSurfaceView = jest.fn();
const mockGetCurrentWorkoutState = jest.fn();
const mockRecordWorkoutSetResult = jest.fn();
const mockRpc = jest.fn();

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

jest.mock('../../src/runtime/services/coach-surface-read.service', () => ({
  buildCoachSurfaceView: mockBuildCoachSurfaceView
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  getCurrentWorkoutState: mockGetCurrentWorkoutState,
  recordWorkoutSetResult: mockRecordWorkoutSetResult
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    rpc: mockRpc
  }))
}));

const { processCompleteCurrentSetAction } = require('../../src/gateway/services/workout-actions.service');

function buildWorkoutState(overrides = {}) {
  return {
    workoutSessionId: 'workout-1',
    sessionKey: 'user:user-123:main',
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

function buildSurface(workout, overrides = {}) {
  return {
    generatedAt: '2026-03-25T10:05:00.000Z',
    sessionKey: workout.sessionKey,
    sessionId: 'session-123',
    header: {
      title: 'Coach',
      subtitle: 'Ready when you are'
    },
    activeRun: null,
    workout,
    pinnedCard: {
      feedItemId: 'workout:workout-1:current',
      reason: 'active_workout',
      placement: 'above_composer'
    },
    feed: [],
    composer: {
      placeholder: 'Message your coach',
      supportsText: true,
      supportsVoice: true
    },
    quickActions: [],
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
    const workoutBefore = buildWorkoutState();
    const workoutAfter = buildWorkoutState({
      currentSetIndex: 2,
      progress: {
        completedExercises: 0,
        totalExercises: 1,
        completedSets: 2,
        totalSets: 3,
        remainingExercises: 1
      }
    });

    mockGetCurrentWorkoutState.mockResolvedValue(workoutBefore);
    mockRecordWorkoutSetResult.mockResolvedValue({
      workout: workoutAfter
    });
    mockBuildCoachSurfaceView.mockResolvedValue(buildSurface(workoutAfter, {
      activeRun: {
        runId: 'run-follow-up-1',
        status: 'queued',
        triggerType: 'ui.action.complete_set',
        createdAt: '2026-03-25T10:05:00.000Z',
        startedAt: null,
        finishedAt: null,
        provider: null,
        model: null
      }
    }));

    const result = await processCompleteCurrentSetAction({
      auth: {
        userId: 'user-123'
      },
      headers: {
        'idempotency-key': 'idem-123'
      },
      body: {
        sessionKey: 'user:user-123:main',
        workoutSessionId: 'workout-1'
      }
    });

    expect(mockRecordWorkoutSetResult).toHaveBeenCalledWith({
      userId: 'user-123',
      input: expect.objectContaining({
        workoutSessionId: 'workout-1',
        workoutExerciseId: 'exercise-1',
        setIndex: 1,
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
        actionId: 'complete_current_set'
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      status: 'ok',
      workout: expect.objectContaining({
        workoutSessionId: 'workout-1',
        currentSetIndex: 2
      }),
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
