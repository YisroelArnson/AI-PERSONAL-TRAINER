const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');
const { persistInboundMessage } = require('../../runtime/services/gateway-ingest.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const {
  acquireSessionMutationLock,
  releaseSessionMutationLock
} = require('../../runtime/services/session-mutation-lock.service');
const { appendSessionEvent } = require('../../runtime/services/transcript-write.service');
const { buildCoachSurfaceView } = require('../../runtime/services/coach-surface-read.service');
const {
  getCurrentWorkoutState,
  recordWorkoutSetResult
} = require('../../runtime/services/workout-state.service');
const { conflict } = require('../../shared/errors');
const { parseCompleteCurrentSetResponse } = require('../schemas/workout-actions.schema');

const COMPLETE_CURRENT_SET_ROUTE = '/v1/workout-actions/complete-current-set';
const COMPLETE_CURRENT_SET_FOLLOW_UP_ROUTE = '/internal/workout-actions/complete-current-set/follow-up';

function normalizeIdempotencyKey(headers = {}) {
  const value = headers['idempotency-key'] || headers['x-idempotency-key'];

  if (!value || !String(value).trim()) {
    return null;
  }

  return String(value).trim();
}

function canonicalSessionKey(userId, sessionKey) {
  const raw = sessionKey && sessionKey.trim() ? sessionKey.trim() : `user:${userId}:main`;
  return raw.toLowerCase();
}

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function resolveCurrentSessionState({ userId, sessionKey, sessionResetPolicy }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase.rpc('resolve_session_surface_state', {
    p_user_id: userId,
    p_session_key: sessionKey,
    p_user_timezone: sessionResetPolicy ? sessionResetPolicy.timezone : 'UTC',
    p_day_boundary_enabled: sessionResetPolicy ? sessionResetPolicy.dayBoundaryEnabled : true,
    p_idle_expiry_minutes: sessionResetPolicy ? sessionResetPolicy.idleExpiryMinutes : 240
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    currentSessionId: data.sessionId || null,
    sessionKey: data.sessionKey || sessionKey
  };
}

function findCurrentExercise(workout) {
  if (!workout || !Array.isArray(workout.exercises)) {
    return null;
  }

  return (
    workout.exercises.find(exercise => exercise.workoutExerciseId === workout.currentExerciseId) ||
    workout.exercises.find(exercise => exercise.orderIndex === workout.currentExerciseIndex) ||
    workout.exercises.find(exercise => exercise.status === 'active') ||
    workout.exercises.find(exercise => exercise.status === 'pending') ||
    null
  );
}

function findCurrentSet(workout, exercise) {
  if (!workout || !exercise || !Array.isArray(exercise.sets)) {
    return null;
  }

  return (
    exercise.sets.find(set => set.setIndex === workout.currentSetIndex) ||
    exercise.sets.find(set => set.status === 'active') ||
    exercise.sets.find(set => set.status === 'pending') ||
    null
  );
}

function buildCompleteSetFollowUpMessage({
  workout,
  exercise,
  set,
  actual,
  userNote
}) {
  const parts = [
    'UI action update: the user tapped the Done button and the backend already recorded the current set as completed.',
    `Workout session id: ${workout.workoutSessionId}.`,
    `Exercise: ${exercise.displayName || exercise.exerciseName}.`,
    `Workout exercise id: ${exercise.workoutExerciseId}.`,
    `Completed set index: ${set.setIndex}.`,
    'Do not call workout_record_set_result for that set again unless you are intentionally correcting history.',
    'If you have something materially useful to add, reply briefly.',
    'If no response is needed, reply exactly: no_reply.'
  ];

  if (actual && Object.keys(actual).length > 0) {
    parts.push(`Recorded actuals: ${JSON.stringify(actual)}.`);
  }

  if (userNote) {
    parts.push(`User note: ${userNote}.`);
  }

  return parts.join(' ');
}

async function enqueueCompleteSetFollowUp({
  userId,
  sessionKey,
  sessionResetPolicy,
  workout,
  exercise,
  set,
  actual,
  userNote,
  parentIdempotencyKey
}) {
  const followUpIdempotencyKey = parentIdempotencyKey
    ? `${parentIdempotencyKey}:follow_up`
    : `complete-set-follow-up:${workout.workoutSessionId}:${exercise.workoutExerciseId}:${set.setIndex}`;

  const persisted = await persistInboundMessage({
    userId,
    route: COMPLETE_CURRENT_SET_FOLLOW_UP_ROUTE,
    idempotencyKey: followUpIdempotencyKey,
    requestHash: followUpIdempotencyKey,
    sessionKey,
    triggerType: 'ui.action.complete_set',
    message: buildCompleteSetFollowUpMessage({
      workout,
      exercise,
      set,
      actual,
      userNote
    }),
    metadata: {
      hiddenInFeed: true,
      source: 'workout_action.complete_current_set',
      actionId: 'complete_current_set',
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: exercise.workoutExerciseId,
      setIndex: set.setIndex
    },
    sessionResetPolicy
  });

  const job = await enqueueAgentRunTurn({
    runId: persisted.runId,
    userId,
    sessionKey: persisted.sessionKey,
    sessionId: persisted.sessionId
  });

  return {
    status: 'queued',
    runId: persisted.runId,
    streamUrl: `/v1/runs/${persisted.runId}/stream`,
    jobId: job.jobId
  };
}

function buildNoActiveWorkoutError(sessionKey) {
  return conflict('No active workout is available to complete a set.', {
    code: 'NO_ACTIVE_WORKOUT',
    sessionKey
  });
}

function buildNoActiveSetError(workoutSessionId) {
  return conflict('There is no current live set to complete in this workout.', {
    code: 'NO_ACTIVE_SET',
    workoutSessionId
  });
}

async function processCompleteCurrentSetAction({ auth, headers, body }) {
  const sessionResetPolicy = await resolveSessionContinuityPolicy(auth.userId);
  const resolvedSessionKey = canonicalSessionKey(auth.userId, body.sessionKey);
  const sessionState = await resolveCurrentSessionState({
    userId: auth.userId,
    sessionKey: resolvedSessionKey,
    sessionResetPolicy
  });

  const lock = await acquireSessionMutationLock({
    userId: auth.userId,
    sessionKey: resolvedSessionKey,
    sessionId: (sessionState && sessionState.currentSessionId) || `session-key:${resolvedSessionKey}`
  });

  if (!lock.acquired) {
    throw conflict('Another request is already mutating this workout session. Try again.', {
      code: 'SESSION_MUTATION_LOCK_BUSY',
      sessionKey: resolvedSessionKey
    });
  }

  try {
    const liveWorkout = await getCurrentWorkoutState({
      userId: auth.userId,
      sessionKey: resolvedSessionKey,
      workoutSessionId: body.workoutSessionId || null
    });

    if (!liveWorkout) {
      throw buildNoActiveWorkoutError(resolvedSessionKey);
    }

    const currentExercise = findCurrentExercise(liveWorkout);
    const currentSet = findCurrentSet(liveWorkout, currentExercise);

    if (!currentExercise || !currentSet) {
      throw buildNoActiveSetError(liveWorkout.workoutSessionId);
    }

    let recordedWorkout;
    let didRecordSetInThisRequest = true;

    try {
      const recorded = await recordWorkoutSetResult({
        userId: auth.userId,
        input: {
          workoutSessionId: liveWorkout.workoutSessionId,
          workoutExerciseId: currentExercise.workoutExerciseId,
          setIndex: currentSet.setIndex,
          resultStatus: 'completed',
          actual: body.actual || {},
          userNote: body.userNote || null,
          decision: null,
          flow: {}
        }
      });

      recordedWorkout = recorded.workout;
    } catch (error) {
      if (error && error.code === 'SET_ALREADY_RECORDED') {
        didRecordSetInThisRequest = false;
        recordedWorkout = await getCurrentWorkoutState({
          userId: auth.userId,
          sessionKey: resolvedSessionKey,
          workoutSessionId: liveWorkout.workoutSessionId
        });
      } else {
        throw error;
      }
    }

    const parentIdempotencyKey = normalizeIdempotencyKey(headers);

    if (didRecordSetInThisRequest && sessionState && sessionState.currentSessionId) {
      try {
        await appendSessionEvent({
          userId: auth.userId,
          sessionKey: resolvedSessionKey,
          sessionId: sessionState.currentSessionId,
          eventType: 'workout.set.completed.ui_action',
          actor: 'user',
          payload: {
            text: 'Completed current workout set via UI.',
            metadata: {
              hiddenInFeed: true,
              source: 'workout_action.complete_current_set',
              actionId: 'complete_current_set'
            },
            workoutSessionId: liveWorkout.workoutSessionId,
            workoutExerciseId: currentExercise.workoutExerciseId,
            setIndex: currentSet.setIndex
          },
          idempotencyKey: parentIdempotencyKey
            ? `${COMPLETE_CURRENT_SET_ROUTE}:${parentIdempotencyKey}:ui_event`
            : null
        });
      } catch (error) {
        console.warn('Unable to append workout.set.completed.ui_action event:', error.message);
      }
    }

    let agentFollowUp = {
      status: 'not_queued',
      runId: null,
      streamUrl: null,
      jobId: null
    };

    if (didRecordSetInThisRequest) {
      try {
        agentFollowUp = await enqueueCompleteSetFollowUp({
          userId: auth.userId,
          sessionKey: resolvedSessionKey,
          sessionResetPolicy,
          workout: liveWorkout,
          exercise: currentExercise,
          set: currentSet,
          actual: body.actual || {},
          userNote: body.userNote || null,
          parentIdempotencyKey
        });
      } catch (error) {
        console.warn('Unable to enqueue workout complete-set follow-up run:', error.message);
        agentFollowUp = {
          status: 'failed',
          runId: null,
          streamUrl: null,
          jobId: null
        };
      }
    }

    const surface = await buildCoachSurfaceView({
      userId: auth.userId,
      sessionKey: resolvedSessionKey,
      sessionResetPolicy
    });

    return parseCompleteCurrentSetResponse({
      status: 'ok',
      workout: recordedWorkout,
      surface,
      agentFollowUp
    });
  } finally {
    try {
      await releaseSessionMutationLock(lock);
    } catch (error) {
      console.warn('Unable to release session mutation lock after workout action:', error.message);
    }
  }
}

module.exports = {
  processCompleteCurrentSetAction
};
