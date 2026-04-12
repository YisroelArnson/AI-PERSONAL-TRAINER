const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');
const { persistInboundMessage } = require('../../runtime/services/gateway-ingest.service');
const { resolveSessionContinuityPolicy } = require('../../runtime/services/session-reset-policy.service');
const {
  acquireSessionMutationLock,
  releaseSessionMutationLock
} = require('../../runtime/services/session-mutation-lock.service');
const { appendSessionEvent } = require('../../runtime/services/transcript-write.service');
const {
  finishWorkoutSession,
  pauseWorkoutSession,
  recordWorkoutSetResult,
  resumeWorkoutSession,
  skipWorkoutExercise,
  startWorkoutSession
} = require('../../runtime/services/workout-state.service');
const { resolveEffectiveLlmSelection } = require('../../runtime/services/llm-config.service');
const { conflict } = require('../../shared/errors');
const { parseWorkoutExecutionActionResponse } = require('../schemas/workout-actions.schema');

const ACTION_CONFIG = {
  start_workout: {
    route: '/v1/workout-actions/start-workout',
    followUpRoute: '/internal/workout-actions/start-workout/follow-up',
    triggerType: 'ui.action.start_workout',
    eventType: 'workout.session.started.ui_action'
  },
  complete_current_set: {
    route: '/v1/workout-actions/complete-current-set',
    followUpRoute: '/internal/workout-actions/complete-current-set/follow-up',
    triggerType: 'ui.action.complete_set',
    eventType: 'workout.set.completed.ui_action'
  },
  skip_current_exercise: {
    route: '/v1/workout-actions/skip-current-exercise',
    followUpRoute: '/internal/workout-actions/skip-current-exercise/follow-up',
    triggerType: 'ui.action.skip_exercise',
    eventType: 'workout.exercise.skipped.ui_action'
  },
  pause_workout: {
    route: '/v1/workout-actions/pause-workout',
    followUpRoute: '/internal/workout-actions/pause-workout/follow-up',
    triggerType: 'ui.action.pause_workout',
    eventType: 'workout.session.paused.ui_action'
  },
  resume_workout: {
    route: '/v1/workout-actions/resume-workout',
    followUpRoute: '/internal/workout-actions/resume-workout/follow-up',
    triggerType: 'ui.action.resume_workout',
    eventType: 'workout.session.resumed.ui_action'
  },
  finish_workout: {
    route: '/v1/workout-actions/finish-workout',
    followUpRoute: '/internal/workout-actions/finish-workout/follow-up',
    triggerType: 'ui.action.finish_workout',
    eventType: 'workout.session.finished.ui_action'
  }
};

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

function buildActionText(actionId, body = {}) {
  switch (actionId) {
    case 'start_workout':
      return 'Started workout via UI.';
    case 'complete_current_set':
      return 'Completed current workout set via UI.';
    case 'skip_current_exercise':
      return 'Skipped current workout exercise via UI.';
    case 'pause_workout':
      return 'Paused workout via UI.';
    case 'resume_workout':
      return 'Resumed workout via UI.';
    case 'finish_workout':
      return 'Finished workout via UI.';
    default:
      return 'Updated workout via UI.';
  }
}

function buildFollowUpMessage({ actionId, workout, body = {} }) {
  const baseParts = [
    `UI action update: the backend already applied ${actionId}.`,
    `Workout session id: ${workout.workoutSessionId}.`,
    `Current status: ${workout.status}.`,
    `Current phase: ${workout.currentPhase}.`,
    `State version: ${workout.stateVersion}.`
  ];

  if (actionId === 'complete_current_set') {
    baseParts.push(`Workout exercise id: ${body.workoutExerciseId}.`);
    baseParts.push(`Completed set index: ${body.setIndex}.`);

    if (body.actual && Object.keys(body.actual).length > 0) {
      baseParts.push(`Recorded actuals: ${JSON.stringify(body.actual)}.`);
    }

    if (body.userNote) {
      baseParts.push(`User note: ${body.userNote}.`);
    }

    baseParts.push('Do not call workout_record_set_result for that set again unless you are intentionally correcting history.');
    baseParts.push('If you have something materially useful to add, reply briefly.');
    baseParts.push('If no response is needed, reply exactly: no_reply.');

    return baseParts.join(' ');
  }

  if (actionId === 'skip_current_exercise') {
    baseParts.push(`Skipped workout exercise id: ${body.workoutExerciseId}.`);
  }

  baseParts.push('If you have something materially useful to add, reply briefly.');
  return baseParts.join(' ');
}

function findWorkoutExercise(workout, workoutExerciseId) {
  if (!workout || !Array.isArray(workout.exercises) || !workoutExerciseId) {
    return null;
  }

  return workout.exercises.find(exercise => exercise.workoutExerciseId === workoutExerciseId) || null;
}

function resolveFollowUpDeliveryMode({ actionId, workout, body = {} }) {
  switch (actionId) {
    case 'start_workout':
    case 'skip_current_exercise':
    case 'finish_workout':
      return 'background';
    case 'complete_current_set': {
      const exercise = findWorkoutExercise(workout, body.workoutExerciseId);
      return exercise && exercise.status === 'completed' ? 'background' : null;
    }
    default:
      return null;
  }
}

async function enqueueActionFollowUp({
  actionId,
  userId,
  sessionKey,
  sessionResetPolicy,
  workout,
  body,
  parentIdempotencyKey,
  effectiveLlm,
  deliveryMode
}) {
  const config = ACTION_CONFIG[actionId];
  const followUpIdempotencyKey = parentIdempotencyKey
    ? `${parentIdempotencyKey}:follow_up`
    : `${actionId}-follow-up:${workout.workoutSessionId}:${workout.stateVersion}`;

  const persisted = await persistInboundMessage({
    userId,
    route: config.followUpRoute,
    idempotencyKey: followUpIdempotencyKey,
    requestHash: followUpIdempotencyKey,
    sessionKey,
    triggerType: config.triggerType,
    message: buildFollowUpMessage({
      actionId,
      workout,
      body
    }),
    metadata: {
      hiddenInFeed: true,
      source: `workout_action.${actionId}`,
      actionId,
      deliveryMode,
      runVisibility: deliveryMode,
      llm: effectiveLlm,
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: body.workoutExerciseId || null,
      setIndex: body.setIndex != null ? body.setIndex : null,
      stateVersion: workout.stateVersion
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
    deliveryMode,
    runId: persisted.runId,
    streamUrl: `/v1/runs/${persisted.runId}/stream`,
    jobId: job.jobId
  };
}

function mapWorkoutActionError(error, sessionKey) {
  if (!error || !error.code) {
    return error;
  }

  switch (error.code) {
    case 'WORKOUT_NOT_FOUND':
      return conflict('No live workout is available for this action.', {
        code: 'NO_ACTIVE_WORKOUT',
        sessionKey,
        ...(error.details || {})
      });
    case 'STALE_WORKOUT_STATE':
      return conflict('Workout state changed. Refresh and try again.', {
        code: 'STALE_WORKOUT_STATE',
        ...(error.details || {})
      });
    case 'WORKOUT_NOT_ACTIVE':
      return conflict('This workout is no longer live.', {
        code: 'WORKOUT_NOT_ACTIVE',
        ...(error.details || {})
      });
    case 'SET_ALREADY_RECORDED':
      return conflict('That set was already recorded.', {
        code: 'SET_ALREADY_RECORDED',
        ...(error.details || {})
      });
    case 'EXERCISE_ALREADY_TERMINAL':
      return conflict('That exercise is already finished.', {
        code: 'EXERCISE_ALREADY_TERMINAL',
        ...(error.details || {})
      });
    case 'EXERCISE_NOT_FOUND':
    case 'SET_NOT_FOUND':
      return conflict('The targeted workout item no longer matches the current state.', {
        code: error.code,
        ...(error.details || {})
      });
    default:
      return error;
  }
}

async function processWorkoutExecutionAction({
  auth,
  headers,
  body,
  actionId,
  applyAction,
  buildAuditPayload
}) {
  const sessionResetPolicy = await resolveSessionContinuityPolicy(auth.userId);
  const effectiveLlm = await resolveEffectiveLlmSelection({
    userId: auth.userId,
    requestedLlm: body.llm || null
  });
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
    let workout;

    try {
      workout = await applyAction();
    } catch (error) {
      throw mapWorkoutActionError(error, resolvedSessionKey);
    }

    const parentIdempotencyKey = normalizeIdempotencyKey(headers);

    if (sessionState && sessionState.currentSessionId) {
      try {
        await appendSessionEvent({
          userId: auth.userId,
          sessionKey: resolvedSessionKey,
          sessionId: sessionState.currentSessionId,
          eventType: ACTION_CONFIG[actionId].eventType,
          actor: 'user',
          payload: {
            text: buildActionText(actionId, body),
            metadata: {
              hiddenInFeed: true,
              source: `workout_action.${actionId}`,
              actionId
            },
            ...buildAuditPayload(workout)
          },
          idempotencyKey: parentIdempotencyKey
            ? `${ACTION_CONFIG[actionId].route}:${parentIdempotencyKey}:ui_event`
            : null
        });
      } catch (error) {
        console.warn(`Unable to append ${ACTION_CONFIG[actionId].eventType} event:`, error.message);
      }
    }

    let agentFollowUp = {
      status: 'not_queued',
      deliveryMode: null,
      runId: null,
      streamUrl: null,
      jobId: null
    };

    const followUpDeliveryMode = resolveFollowUpDeliveryMode({
      actionId,
      workout,
      body
    });

    if (followUpDeliveryMode) {
      try {
        agentFollowUp = await enqueueActionFollowUp({
          actionId,
          userId: auth.userId,
          sessionKey: resolvedSessionKey,
          sessionResetPolicy,
          workout,
          body,
          parentIdempotencyKey,
          effectiveLlm,
          deliveryMode: followUpDeliveryMode
        });
      } catch (error) {
        console.warn(`Unable to enqueue ${actionId} follow-up run:`, error.message);
        agentFollowUp = {
          status: 'failed',
          deliveryMode: followUpDeliveryMode,
          runId: null,
          streamUrl: null,
          jobId: null
        };
      }
    }

    return parseWorkoutExecutionActionResponse({
      status: 'ok',
      workout,
      appliedStateVersion: workout.stateVersion,
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

async function processStartWorkoutAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'start_workout',
    applyAction: () => startWorkoutSession({
      userId: auth.userId,
      input: {
        workoutSessionId: body.workoutSessionId,
        expectedStateVersion: body.expectedStateVersion
      }
    }),
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId
    })
  });
}

async function processCompleteCurrentSetAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'complete_current_set',
    applyAction: async () => {
      const recorded = await recordWorkoutSetResult({
        userId: auth.userId,
        input: {
          workoutSessionId: body.workoutSessionId,
          workoutExerciseId: body.workoutExerciseId,
          setIndex: body.setIndex,
          expectedStateVersion: body.expectedStateVersion,
          resultStatus: 'completed',
          actual: body.actual || {},
          userNote: body.userNote || null,
          decision: null,
          flow: {}
        }
      });

      return recorded.workout;
    },
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: body.workoutExerciseId,
      setIndex: body.setIndex
    })
  });
}

async function processSkipCurrentExerciseAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'skip_current_exercise',
    applyAction: () => skipWorkoutExercise({
      userId: auth.userId,
      input: {
        workoutSessionId: body.workoutSessionId,
        workoutExerciseId: body.workoutExerciseId,
        expectedStateVersion: body.expectedStateVersion
      }
    }),
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: body.workoutExerciseId
    })
  });
}

async function processPauseWorkoutAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'pause_workout',
    applyAction: () => pauseWorkoutSession({
      userId: auth.userId,
      input: {
        workoutSessionId: body.workoutSessionId,
        expectedStateVersion: body.expectedStateVersion
      }
    }),
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId
    })
  });
}

async function processResumeWorkoutAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'resume_workout',
    applyAction: () => resumeWorkoutSession({
      userId: auth.userId,
      input: {
        workoutSessionId: body.workoutSessionId,
        expectedStateVersion: body.expectedStateVersion
      }
    }),
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId
    })
  });
}

async function processFinishWorkoutAction({ auth, headers, body }) {
  return processWorkoutExecutionAction({
    auth,
    headers,
    body,
    actionId: 'finish_workout',
    applyAction: () => finishWorkoutSession({
      userId: auth.userId,
      input: {
        workoutSessionId: body.workoutSessionId,
        expectedStateVersion: body.expectedStateVersion,
        finalStatus: 'completed',
        decision: null,
        summary: {}
      }
    }),
    buildAuditPayload: workout => ({
      workoutSessionId: workout.workoutSessionId
    })
  });
}

module.exports = {
  processCompleteCurrentSetAction,
  processFinishWorkoutAction,
  processPauseWorkoutAction,
  processResumeWorkoutAction,
  processSkipCurrentExerciseAction,
  processStartWorkoutAction
};
