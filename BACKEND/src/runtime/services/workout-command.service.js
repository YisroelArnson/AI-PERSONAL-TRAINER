/**
 * File overview:
 * Implements runtime service logic for workout command.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - normalizeIdempotencyKey: Normalizes Idempotency key into the format this file expects.
 * - canonicalSessionKey: Builds the canonical form of Session key.
 * - resolveCurrentSessionState: Resolves Current session state before the next step runs.
 * - getStoredWorkoutCommand: Gets Stored workout command needed by this file.
 * - hasQueuedOrRunningRunForSession: Handles Has queued or running run for session for workout-command.service.js.
 * - getLatestUserCommand: Gets Latest user command needed by this file.
 * - loadNextServerSequence: Loads Next server sequence for the surrounding workflow.
 * - updateSessionCommandSequence: Updates Session command sequence with the latest state.
 * - isTerminalNoopError: Handles Is terminal noop error for workout-command.service.js.
 * - isTargetConflictError: Handles Is target conflict error for workout-command.service.js.
 * - mapCommandError: Maps Command error into the structure expected downstream.
 * - findWorkoutExercise: Handles Find workout exercise for workout-command.service.js.
 * - resolveFollowUpDeliveryMode: Resolves Follow up delivery mode before the next step runs.
 * - buildFollowUpMessage: Builds a Follow up message used by this file.
 * - buildAgentNoticeText: Builds an Agent notice text used by this file.
 * - buildUserAuditText: Builds an User audit text used by this file.
 * - enqueueCommandFollowUp: Enqueues Command follow up for asynchronous work.
 * - buildCommandResult: Builds a Command result used by this file.
 * - buildStoredCommandResponse: Builds a Stored command response used by this file.
 * - persistCommandResult: Persists Command result for later use.
 * - appendAuditEvent: Appends Audit event to the existing record.
 * - maybeQueueFollowUp: Handles Maybe queue follow up for workout-command.service.js.
 * - shouldRejectAgentCommand: Handles Should reject agent command for workout-command.service.js.
 * - applyCommand: Applies Command to the current data.
 * - executeWorkoutCommand: Executes the main Workout command flow.
 */

const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { enqueueAgentRunTurn } = require('../../infra/queue/agent.queue');
const { persistInboundMessage } = require('./gateway-ingest.service');
const { resolveSessionContinuityPolicy } = require('./session-reset-policy.service');
const {
  WorkoutMutationLockBusyError,
  acquireWorkoutMutationLock,
  releaseSessionMutationLock
} = require('./session-mutation-lock.service');
const { appendSessionEvent } = require('./transcript-write.service');
const {
  adjustWorkoutSetTargets,
  finishWorkoutSession,
  getCurrentWorkoutState,
  pauseWorkoutSession,
  recordWorkoutSetResult,
  replaceWorkoutExerciseFromDraft,
  resumeWorkoutSession,
  rewriteRemainingWorkoutFromDraft,
  skipWorkoutExercise,
  startWorkoutSession
} = require('./workout-state.service');
const { resolveEffectiveLlmSelection } = require('./llm-config.service');
const { parseWorkoutCommandResponse } = require('../../gateway/schemas/workout-commands.schema');

const USER_ACTOR = 'user_ui';
const AGENT_ACTOR = 'agent';
const SYSTEM_ACTOR = 'system';
const WORKOUT_MUTATION_LOCK_RETRY_DELAYS_MS = [0, 50, 100, 200, 400];

const DIRECT_COMMAND_CONFIG = {
  'session.start': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/session-start/follow-up',
    triggerType: 'ui.action.start_workout',
    eventType: 'workout.command.applied'
  },
  'set.complete': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/set-complete/follow-up',
    triggerType: 'ui.action.complete_set',
    eventType: 'workout.command.applied'
  },
  'set.skip': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/set-skip/follow-up',
    triggerType: 'ui.action.complete_set',
    eventType: 'workout.command.applied'
  },
  'exercise.skip': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/exercise-skip/follow-up',
    triggerType: 'ui.action.skip_exercise',
    eventType: 'workout.command.applied'
  },
  'session.pause': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/session-pause/follow-up',
    triggerType: 'ui.action.pause_workout',
    eventType: 'workout.command.applied'
  },
  'session.resume': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/session-resume/follow-up',
    triggerType: 'ui.action.resume_workout',
    eventType: 'workout.command.applied'
  },
  'session.finish': {
    route: '/v1/workout-commands',
    followUpRoute: '/internal/workout-commands/session-finish/follow-up',
    triggerType: 'ui.action.finish_workout',
    eventType: 'workout.command.applied'
  }
};

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Normalizes Idempotency key into the format this file expects.
 */
function normalizeIdempotencyKey(headers = {}) {
  const value = headers['idempotency-key'] || headers['x-idempotency-key'];

  if (!value || !String(value).trim()) {
    return null;
  }

  return String(value).trim();
}

/**
 * Builds the canonical form of Session key.
 */
function canonicalSessionKey(userId, sessionKey) {
  const raw = sessionKey && sessionKey.trim() ? sessionKey.trim() : `user:${userId}:main`;
  return raw.toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function acquireWorkoutMutationLockWithRetry({ userId, workoutSessionId }) {
  let lastLock = null;

  for (const delayMs of WORKOUT_MUTATION_LOCK_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    lastLock = await acquireWorkoutMutationLock({
      userId,
      workoutSessionId
    });

    if (lastLock.acquired) {
      return lastLock;
    }
  }

  throw new WorkoutMutationLockBusyError(`Workout ${workoutSessionId} is currently being mutated by another request`);
}

/**
 * Resolves Current session state before the next step runs.
 */
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

/**
 * Gets Stored workout command needed by this file.
 */
async function getStoredWorkoutCommand({ userId, workoutSessionId, commandId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_commands')
    .select('*')
    .eq('user_id', userId)
    .eq('workout_session_id', workoutSessionId)
    .eq('command_id', commandId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Handles Has queued or running run for session for workout-command.service.js.
 */
async function hasQueuedOrRunningRunForSession({ userId, sessionKey, sessionId }) {
  if (!userId || !sessionKey || !sessionId) {
    return false;
  }

  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('runs')
    .select('run_id')
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .in('status', ['queued', 'running'])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data && data.run_id);
}

/**
 * Gets Latest user command needed by this file.
 */
async function getLatestUserCommand({ userId, workoutSessionId }) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_commands')
    .select('*')
    .eq('user_id', userId)
    .eq('workout_session_id', workoutSessionId)
    .eq('origin_actor', USER_ACTOR)
    .in('status', ['accepted', 'replayed', 'noop'])
    .order('server_sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Loads Next server sequence for the surrounding workflow.
 */
async function loadNextServerSequence({ userId, workoutSessionId }) {
  const supabase = getAdminClientOrThrow();
  const [{ data: sessionRow, error: sessionError }, { data: latestCommand, error: latestError }] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('last_command_sequence')
      .eq('user_id', userId)
      .eq('workout_session_id', workoutSessionId)
      .maybeSingle(),
    supabase
      .from('workout_commands')
      .select('server_sequence')
      .eq('user_id', userId)
      .eq('workout_session_id', workoutSessionId)
      .order('server_sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (sessionError) {
    throw sessionError;
  }

  if (latestError) {
    throw latestError;
  }

  const sessionSequence = Number.isInteger(sessionRow && sessionRow.last_command_sequence)
    ? sessionRow.last_command_sequence
    : 0;
  const latestSequence = Number.isInteger(latestCommand && latestCommand.server_sequence)
    ? latestCommand.server_sequence
    : 0;

  return Math.max(sessionSequence, latestSequence) + 1;
}

/**
 * Updates Session command sequence with the latest state.
 */
async function updateSessionCommandSequence({ userId, workoutSessionId, serverSequence }) {
  const supabase = getAdminClientOrThrow();
  const { error } = await supabase
    .from('workout_sessions')
    .update({
      last_command_sequence: serverSequence
    })
    .eq('user_id', userId)
    .eq('workout_session_id', workoutSessionId);

  if (error) {
    throw error;
  }
}

/**
 * Handles Is terminal noop error for workout-command.service.js.
 */
function isTerminalNoopError(error) {
  return error && ['SET_ALREADY_RECORDED', 'EXERCISE_ALREADY_TERMINAL'].includes(error.code);
}

/**
 * Handles Is target conflict error for workout-command.service.js.
 */
function isTargetConflictError(error) {
  return error && ['EXERCISE_NOT_FOUND', 'SET_NOT_FOUND', 'INVALID_FLOW_DIRECTIVE'].includes(error.code);
}

/**
 * Maps Command error into the structure expected downstream.
 */
function mapCommandError(error) {
  if (!error || !error.code) {
    return {
      status: 'rejected',
      resolution: 'rejected',
      conflict: {
        code: 'UNKNOWN',
        message: error && error.message ? error.message : 'Unknown workout command error.'
      }
    };
  }

  if (error.code === 'STALE_WORKOUT_STATE') {
    return {
      status: 'rejected',
      resolution: 'stale',
      conflict: {
        code: error.code,
        message: 'The workout state advanced before this command could be applied.'
      }
    };
  }

  if (error.code === 'WORKOUT_NOT_ACTIVE') {
    return {
      status: 'rejected',
      resolution: 'not_live',
      conflict: {
        code: error.code,
        message: 'This workout is no longer live.'
      }
    };
  }

  if (isTargetConflictError(error)) {
    return {
      status: 'rejected',
      resolution: 'invalid_target',
      conflict: {
        code: error.code,
        message: 'The targeted workout item no longer matches the current state.'
      }
    };
  }

  if (isTerminalNoopError(error)) {
    return {
      status: 'noop',
      resolution: 'noop_terminal',
      conflict: null
    };
  }

  return {
    status: 'rejected',
    resolution: 'rejected',
    conflict: {
      code: error.code,
      message: error.message || error.code
    }
  };
}

/**
 * Handles Find workout exercise for workout-command.service.js.
 */
function findWorkoutExercise(workout, workoutExerciseId) {
  if (!workout || !Array.isArray(workout.exercises) || !workoutExerciseId) {
    return null;
  }

  return workout.exercises.find(exercise => exercise.workoutExerciseId === workoutExerciseId) || null;
}

/**
 * Resolves Follow up delivery mode before the next step runs.
 */
function resolveFollowUpDeliveryMode({ commandType, workout, payload = {} }) {
  switch (commandType) {
    case 'session.start':
    case 'exercise.skip':
    case 'session.finish':
      return 'background';
    case 'set.complete': {
      const exercise = findWorkoutExercise(workout, payload.workoutExerciseId);
      return exercise && exercise.status === 'completed' ? 'background' : null;
    }
    default:
      return null;
  }
}

/**
 * Builds a Follow up message used by this file.
 */
function buildFollowUpMessage({ commandType, workout, payload = {} }) {
  const baseParts = [
    `Workout command update: the backend already applied ${commandType}.`,
    `Workout session id: ${workout.workoutSessionId}.`,
    `Current status: ${workout.status}.`,
    `Current phase: ${workout.currentPhase}.`,
    `State version: ${workout.stateVersion}.`
  ];

  if (commandType === 'set.complete') {
    baseParts.push(`Workout exercise id: ${payload.workoutExerciseId}.`);
    baseParts.push(`Completed set index: ${payload.setIndex}.`);

    if (payload.actual && Object.keys(payload.actual).length > 0) {
      baseParts.push(`Recorded actuals: ${JSON.stringify(payload.actual)}.`);
    }

    if (payload.userNote) {
      baseParts.push(`User note: ${payload.userNote}.`);
    }

    baseParts.push('Do not record that set again unless you are intentionally correcting history.');
    baseParts.push('If you have something materially useful to add, send it with message_notify_user.');
    baseParts.push('If no response is needed, end the run with idle.');
    return baseParts.join(' ');
  }

  baseParts.push('If you have something materially useful to add, send it with message_notify_user.');
  baseParts.push('If no response is needed, end the run with idle.');
  return baseParts.join(' ');
}

/**
 * Builds an Agent notice text used by this file.
 */
function buildAgentNoticeText(command) {
  const payload = command.payload || {};

  switch (command.commandType) {
    case 'session.start':
      return 'Coach started the workout.';
    case 'set.complete':
      return `Coach marked set ${Number(payload.setIndex) + 1} complete.`;
    case 'set.skip':
      return `Coach skipped set ${Number(payload.setIndex) + 1}.`;
    case 'exercise.skip':
      return 'Coach skipped the current exercise.';
    case 'session.pause':
      return 'Coach paused the workout.';
    case 'session.resume':
      return 'Coach resumed the workout.';
    case 'session.finish':
      return 'Coach finished the workout.';
    case 'set.targets.adjust':
      return 'Coach adjusted upcoming set targets.';
    case 'exercise.replace':
      return payload.replacement && payload.replacement.exerciseName
        ? `Coach swapped in ${payload.replacement.exerciseName}.`
        : 'Coach replaced the current exercise.';
    case 'workout.remaining.rewrite':
      return 'Coach rewrote the remaining workout.';
    default:
      return 'Coach updated the workout.';
  }
}

/**
 * Builds an User audit text used by this file.
 */
function buildUserAuditText(command) {
  switch (command.commandType) {
    case 'session.start':
      return 'Started workout via UI.';
    case 'set.complete':
      return 'Completed current workout set via UI.';
    case 'set.skip':
      return 'Skipped workout set via UI.';
    case 'exercise.skip':
      return 'Skipped current workout exercise via UI.';
    case 'session.pause':
      return 'Paused workout via UI.';
    case 'session.resume':
      return 'Resumed workout via UI.';
    case 'session.finish':
      return 'Finished workout via UI.';
    default:
      return 'Updated workout via UI.';
  }
}

/**
 * Enqueues Command follow up for asynchronous work.
 */
async function enqueueCommandFollowUp({
  userId,
  sessionKey,
  sessionResetPolicy,
  command,
  workout,
  parentIdempotencyKey,
  effectiveLlm,
  deliveryMode
}) {
  const config = DIRECT_COMMAND_CONFIG[command.commandType];
  const followUpIdempotencyKey = parentIdempotencyKey
    ? `${parentIdempotencyKey}:follow_up`
    : `${command.commandType}:follow-up:${workout.workoutSessionId}:${workout.stateVersion}`;

  const persisted = await persistInboundMessage({
    userId,
    route: config.followUpRoute,
    idempotencyKey: followUpIdempotencyKey,
    requestHash: followUpIdempotencyKey,
    sessionKey,
    triggerType: config.triggerType,
    message: buildFollowUpMessage({
      commandType: command.commandType,
      workout,
      payload: command.payload
    }),
    metadata: {
      hiddenInFeed: true,
      source: `workout_command.${command.commandType}`,
      commandId: command.commandId,
      commandType: command.commandType,
      deliveryMode,
      runVisibility: deliveryMode,
      llm: effectiveLlm,
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: command.payload && command.payload.workoutExerciseId ? command.payload.workoutExerciseId : null,
      setIndex: command.payload && command.payload.setIndex != null ? command.payload.setIndex : null,
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

/**
 * Builds a Command result used by this file.
 */
function buildCommandResult({
  command,
  serverSequence,
  status,
  resolution,
  workout,
  conflict = null,
  isUndoable = false
}) {
  return {
    commandId: command.commandId,
    commandType: command.commandType,
    actor: command.origin.actor,
    clientSequence: command.clientSequence != null ? command.clientSequence : null,
    serverSequence,
    status,
    resolution,
    appliedStateVersion: workout ? workout.stateVersion : null,
    conflict,
    isUndoable
  };
}

/**
 * Builds a Stored command response used by this file.
 */
function buildStoredCommandResponse(row) {
  return parseWorkoutCommandResponse({
    status: 'ok',
    command: {
      commandId: row.command_id,
      commandType: row.command_type,
      actor: row.origin_actor,
      clientSequence: row.client_sequence,
      serverSequence: row.server_sequence,
      status: row.status,
      resolution: row.resolution,
      appliedStateVersion: row.applied_state_version,
      conflict: row.conflict_metadata && Object.keys(row.conflict_metadata).length > 0
        ? row.conflict_metadata
        : null,
      isUndoable: false
    },
    workout: row.result_workout,
    appliedStateVersion: row.applied_state_version,
    agentFollowUp: row.agent_follow_up && Object.keys(row.agent_follow_up).length > 0
      ? row.agent_follow_up
      : {
          status: 'not_queued',
          deliveryMode: null,
          runId: null,
          streamUrl: null,
          jobId: null
        }
  });
}

/**
 * Persists Command result for later use.
 */
async function persistCommandResult({
  userId,
  sessionKey,
  sessionId,
  workoutSessionId,
  command,
  serverSequence,
  commandResult,
  workout,
  agentFollowUp
}) {
  const supabase = getAdminClientOrThrow();
  const row = {
    command_id: command.commandId,
    user_id: userId,
    session_key: sessionKey,
    session_id: sessionId || null,
    workout_session_id: workoutSessionId,
    origin_actor: command.origin.actor,
    origin_device_id: command.origin.deviceId || null,
    origin_run_id: command.origin.runId || null,
    origin_occurred_at: command.origin.occurredAt || new Date().toISOString(),
    command_type: command.commandType,
    client_sequence: command.clientSequence != null ? command.clientSequence : null,
    base_state_version: command.baseStateVersion != null ? command.baseStateVersion : null,
    server_sequence: serverSequence,
    status: commandResult.status,
    resolution: commandResult.resolution,
    payload: command.payload || {},
    conflict_metadata: commandResult.conflict || {},
    result_workout: workout,
    agent_follow_up: agentFollowUp || {},
    applied_state_version: workout ? workout.stateVersion : null,
    applied_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('workout_commands')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await updateSessionCommandSequence({
    userId,
    workoutSessionId,
    serverSequence
  });

  return data;
}

/**
 * Appends Audit event to the existing record.
 */
async function appendAuditEvent({
  userId,
  sessionKey,
  sessionId,
  command,
  commandResult,
  workout
}) {
  if (!sessionId || !workout) {
    return;
  }

  const isUserCommand = command.origin.actor === USER_ACTOR;
  const text = commandResult.status === 'rejected'
    ? (isUserCommand
        ? buildUserAuditText(command)
        : 'Coach update discarded because a newer user action already changed the workout.')
    : (isUserCommand ? buildUserAuditText(command) : buildAgentNoticeText(command));
  const hiddenInFeed = isUserCommand || commandResult.status === 'rejected';

  await appendSessionEvent({
    userId,
    sessionKey,
    sessionId,
    eventType: commandResult.status === 'rejected' ? 'workout.command.rejected' : 'workout.command.applied',
    actor: isUserCommand ? 'user' : 'assistant',
    runId: command.origin.runId || null,
    payload: {
      text,
      metadata: {
        hiddenInFeed,
        source: `workout_command.${command.commandType}`,
        commandId: command.commandId,
        commandType: command.commandType,
        resolution: commandResult.resolution
      },
      command: commandResult,
      workoutSessionId: workout.workoutSessionId,
      workoutExerciseId: command.payload && command.payload.workoutExerciseId ? command.payload.workoutExerciseId : null,
      setIndex: command.payload && command.payload.setIndex != null ? command.payload.setIndex : null
    },
    idempotencyKey: `workout-command:${command.commandId}:audit`
  });
}

/**
 * Handles Maybe queue follow up for workout-command.service.js.
 */
async function maybeQueueFollowUp({
  userId,
  sessionKey,
  sessionId,
  sessionResetPolicy,
  command,
  workout,
  headers,
  requestedLlm
}) {
  if (command.origin.actor !== USER_ACTOR || !DIRECT_COMMAND_CONFIG[command.commandType]) {
    return {
      status: 'not_queued',
      deliveryMode: null,
      runId: null,
      streamUrl: null,
      jobId: null
    };
  }

  const deliveryMode = resolveFollowUpDeliveryMode({
    commandType: command.commandType,
    workout,
    payload: command.payload
  });

  if (!deliveryMode) {
    return {
      status: 'not_queued',
      deliveryMode: null,
      runId: null,
      streamUrl: null,
      jobId: null
    };
  }

  const hasActiveRun = await hasQueuedOrRunningRunForSession({
    userId,
    sessionKey,
    sessionId
  });

  if (hasActiveRun && deliveryMode === 'background') {
    return {
      status: 'not_queued',
      deliveryMode,
      runId: null,
      streamUrl: null,
      jobId: null
    };
  }

  const effectiveLlm = await resolveEffectiveLlmSelection({
    userId,
    requestedLlm: requestedLlm || null
  });

  try {
    return await enqueueCommandFollowUp({
      userId,
      sessionKey,
      sessionResetPolicy,
      command,
      workout,
      parentIdempotencyKey: normalizeIdempotencyKey(headers),
      effectiveLlm,
      deliveryMode
    });
  } catch (error) {
    console.warn(`Unable to enqueue ${command.commandType} follow-up run:`, error.message);
    return {
      status: 'failed',
      deliveryMode,
      runId: null,
      streamUrl: null,
      jobId: null
    };
  }
}

/**
 * Handles Should reject agent command for workout-command.service.js.
 */
function shouldRejectAgentCommand({ command, canonicalWorkout, latestUserCommand, runContext }) {
  if (command.origin.actor !== AGENT_ACTOR) {
    return null;
  }

  if (
    command.baseStateVersion != null &&
    canonicalWorkout &&
    canonicalWorkout.stateVersion !== command.baseStateVersion
  ) {
    return {
      status: 'rejected',
      resolution: 'stale',
      conflict: {
        code: 'STALE_WORKOUT_STATE',
        message: 'The workout changed before this agent command was applied.',
        winner: USER_ACTOR,
        latestStateVersion: canonicalWorkout.stateVersion,
        latestServerSequence: latestUserCommand ? latestUserCommand.server_sequence : null
      }
    };
  }

  const originStartedAt = command.origin.occurredAt
    || (runContext && (runContext.startedAt || runContext.createdAt))
    || null;

  if (
    latestUserCommand &&
    originStartedAt &&
    latestUserCommand.applied_at &&
    Date.parse(latestUserCommand.applied_at) > Date.parse(originStartedAt)
  ) {
    return {
      status: 'rejected',
      resolution: 'conflict_user_priority',
      conflict: {
        code: 'CONFLICT_USER_PRIORITY',
        message: 'A newer user action already changed this workout.',
        winner: USER_ACTOR,
        latestStateVersion: canonicalWorkout ? canonicalWorkout.stateVersion : null,
        latestServerSequence: latestUserCommand.server_sequence
      }
    };
  }

  return null;
}

/**
 * Applies Command to the current data.
 */
async function applyCommand({
  userId,
  command,
  canonicalWorkout
}) {
  const userExpectedStateVersion = command.origin.actor === USER_ACTOR
    ? null
    : command.baseStateVersion;

  switch (command.commandType) {
    case 'session.start':
      return startWorkoutSession({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          expectedStateVersion: userExpectedStateVersion
        }
      });
    case 'set.complete': {
      const result = await recordWorkoutSetResult({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          workoutExerciseId: command.payload.workoutExerciseId,
          setIndex: command.payload.setIndex,
          expectedStateVersion: userExpectedStateVersion,
          resultStatus: 'completed',
          actual: command.payload.actual || {},
          userNote: command.payload.userNote || null,
          decision: null,
          flow: {}
        }
      });

      return result.workout;
    }
    case 'set.skip': {
      const result = await recordWorkoutSetResult({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          workoutExerciseId: command.payload.workoutExerciseId,
          setIndex: command.payload.setIndex,
          expectedStateVersion: userExpectedStateVersion,
          resultStatus: 'skipped',
          actual: command.payload.actual || {},
          userNote: command.payload.userNote || null,
          decision: null,
          flow: {}
        }
      });

      return result.workout;
    }
    case 'exercise.skip':
      return skipWorkoutExercise({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          workoutExerciseId: command.payload.workoutExerciseId,
          expectedStateVersion: userExpectedStateVersion
        }
      });
    case 'session.pause':
      return pauseWorkoutSession({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          expectedStateVersion: userExpectedStateVersion
        }
      });
    case 'session.resume':
      return resumeWorkoutSession({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          expectedStateVersion: userExpectedStateVersion
        }
      });
    case 'session.finish':
      return finishWorkoutSession({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          expectedStateVersion: userExpectedStateVersion,
          finalStatus: command.payload.finalStatus || 'completed',
          decision: null,
          summary: command.payload.summary || {}
        }
      });
    case 'set.targets.adjust':
      return adjustWorkoutSetTargets({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          workoutExerciseId: command.payload.workoutExerciseId,
          decision: command.payload.decision,
          setUpdates: command.payload.setUpdates,
          flow: command.payload.flow || {}
        }
      });
    case 'exercise.replace':
      return replaceWorkoutExerciseFromDraft({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          workoutExerciseId: command.payload.workoutExerciseId,
          decision: command.payload.decision,
          replacement: command.payload.replacement,
          flow: command.payload.flow || {}
        }
      });
    case 'workout.remaining.rewrite':
      return rewriteRemainingWorkoutFromDraft({
        userId,
        input: {
          workoutSessionId: command.workoutSessionId,
          decision: command.payload.decision,
          title: command.payload.title || null,
          guidance: command.payload.guidance || {},
          remainingExercises: command.payload.remainingExercises,
          flow: command.payload.flow || {}
        }
      });
    default:
      throw new Error(`Unsupported workout command type: ${command.commandType}`);
  }
}

/**
 * Executes the main Workout command flow.
 */
async function executeWorkoutCommand({
  userId,
  command,
  headers = {},
  runContext = null,
  requestedLlm = null
}) {
  const sessionResetPolicy = await resolveSessionContinuityPolicy(userId);
  const resolvedSessionKey = canonicalSessionKey(userId, command.sessionKey);
  const sessionState = await resolveCurrentSessionState({
    userId,
    sessionKey: resolvedSessionKey,
    sessionResetPolicy
  });

  const lock = await acquireWorkoutMutationLockWithRetry({
    userId,
    workoutSessionId: command.workoutSessionId
  });

  try {
    const stored = await getStoredWorkoutCommand({
      userId,
      workoutSessionId: command.workoutSessionId,
      commandId: command.commandId
    });

    if (stored) {
      return buildStoredCommandResponse(stored);
    }

    const canonicalWorkout = await getCurrentWorkoutState({
      userId,
      workoutSessionId: command.workoutSessionId,
      bypassCache: true
    });

    if (!canonicalWorkout) {
      const error = new Error('WORKOUT_NOT_FOUND');
      error.code = 'WORKOUT_NOT_FOUND';
      error.details = {
        workoutSessionId: command.workoutSessionId
      };
      throw error;
    }

    const nextServerSequence = await loadNextServerSequence({
      userId,
      workoutSessionId: command.workoutSessionId
    });

    const latestUserCommand = await getLatestUserCommand({
      userId,
      workoutSessionId: command.workoutSessionId
    });

    const rejectedAgentResult = shouldRejectAgentCommand({
      command,
      canonicalWorkout,
      latestUserCommand,
      runContext
    });

    if (rejectedAgentResult) {
      const commandResult = buildCommandResult({
        command,
        serverSequence: nextServerSequence,
        status: rejectedAgentResult.status,
        resolution: rejectedAgentResult.resolution,
        workout: canonicalWorkout,
        conflict: rejectedAgentResult.conflict
      });
      const storedRow = await persistCommandResult({
        userId,
        sessionKey: resolvedSessionKey,
        sessionId: sessionState && sessionState.currentSessionId,
        workoutSessionId: command.workoutSessionId,
        command,
        serverSequence: nextServerSequence,
        commandResult,
        workout: canonicalWorkout,
        agentFollowUp: {
          status: 'not_queued',
          deliveryMode: null,
          runId: null,
          streamUrl: null,
          jobId: null
        }
      });

      try {
        await appendAuditEvent({
          userId,
          sessionKey: resolvedSessionKey,
          sessionId: sessionState && sessionState.currentSessionId,
          command,
          commandResult,
          workout: canonicalWorkout
        });
      } catch (error) {
        console.warn('Unable to append workout command audit event:', error.message);
      }

      return buildStoredCommandResponse(storedRow);
    }

    let workoutAfter = canonicalWorkout;
    let commandError = null;

    try {
      workoutAfter = await applyCommand({
        userId,
        command,
        canonicalWorkout
      });
    } catch (error) {
      commandError = error;
    }

    const mappedError = commandError ? mapCommandError(commandError) : null;
    const isNoop = mappedError && mappedError.status === 'noop';
    const isRejected = mappedError && mappedError.status === 'rejected';
    const finalWorkout = workoutAfter || canonicalWorkout;
    const commandResult = buildCommandResult({
      command,
      serverSequence: nextServerSequence,
      status: mappedError ? mappedError.status : 'accepted',
      resolution: mappedError ? mappedError.resolution : 'applied',
      workout: finalWorkout,
      conflict: mappedError ? mappedError.conflict : null
    });

    if (commandError && !isNoop && !isRejected) {
      throw commandError;
    }

    const agentFollowUp = !commandError
      ? await maybeQueueFollowUp({
          userId,
          sessionKey: resolvedSessionKey,
          sessionId: sessionState && sessionState.currentSessionId,
          sessionResetPolicy,
          command,
          workout: finalWorkout,
          headers,
          requestedLlm
        })
      : {
          status: 'not_queued',
          deliveryMode: null,
          runId: null,
          streamUrl: null,
          jobId: null
        };

    const storedRow = await persistCommandResult({
      userId,
      sessionKey: resolvedSessionKey,
      sessionId: sessionState && sessionState.currentSessionId,
      workoutSessionId: command.workoutSessionId,
      command,
      serverSequence: nextServerSequence,
      commandResult,
      workout: finalWorkout,
      agentFollowUp
    });

    try {
      await appendAuditEvent({
        userId,
        sessionKey: resolvedSessionKey,
        sessionId: sessionState && sessionState.currentSessionId,
        command,
        commandResult,
        workout: finalWorkout
      });
    } catch (error) {
      console.warn('Unable to append workout command audit event:', error.message);
    }

    return buildStoredCommandResponse(storedRow);
  } finally {
    try {
      await releaseSessionMutationLock(lock);
    } catch (error) {
      console.warn('Unable to release workout mutation lock after workout command:', error.message);
    }
  }
}

module.exports = {
  AGENT_ACTOR,
  SYSTEM_ACTOR,
  USER_ACTOR,
  executeWorkoutCommand
};
