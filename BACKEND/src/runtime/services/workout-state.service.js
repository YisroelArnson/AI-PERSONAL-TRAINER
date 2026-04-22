/**
 * File overview:
 * Implements runtime service logic for workout state.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - getRedisOrNull: Gets Redis or null needed by this file.
 * - buildWorkoutStateSessionCacheKey: Builds a Workout state session cache key used by this file.
 * - buildWorkoutStateIdCacheKey: Builds a Workout state ID cache key used by this file.
 * - getCachedWorkoutState: Gets Cached workout state needed by this file.
 * - evictWorkoutStateCache: Handles Evict workout state cache for workout-state.service.js.
 * - cacheWorkoutState: Handles Cache workout state for workout-state.service.js.
 * - buildError: Builds an Error used by this file.
 * - coerceStateVersion: Coerces State version into the expected type.
 * - buildNextStateVersion: Builds a Next state version used by this file.
 * - normalizeIdleExpiryMinutes: Normalizes Idle expiry minutes into the format this file expects.
 * - resolveWorkoutIdleExpiryMinutes: Resolves Workout idle expiry minutes before the next step runs.
 * - getWorkoutSessionLastTouchedAt: Gets Workout session last touched at needed by this file.
 * - isWorkoutSessionExpired: Handles Is workout session expired for workout-state.service.js.
 * - buildAbandonedWorkoutSummary: Builds an Abandoned workout summary used by this file.
 * - expireStaleWorkoutSessionIfNeeded: Handles Expire stale workout session if needed for workout-state.service.js.
 * - assertExpectedStateVersion: Handles Assert expected state version for workout-state.service.js.
 * - normalizeExerciseName: Normalizes Exercise name into the format this file expects.
 * - isUuid: Handles Is UUID for workout-state.service.js.
 * - isCurrentReference: Handles Is current reference for workout-state.service.js.
 * - normalizeReferenceToken: Normalizes Reference token into the format this file expects.
 * - resolveExerciseDefinitionId: Resolves Exercise definition ID before the next step runs.
 * - buildExerciseKey: Builds an Exercise key used by this file.
 * - buildSessionGuidancePayload: Builds a Session guidance payload used by this file.
 * - buildSessionSummaryPayload: Builds a Session summary payload used by this file.
 * - buildExercisePrescriptionPayload: Builds an Exercise prescription payload used by this file.
 * - buildSetNotes: Builds a Set notes used by this file.
 * - buildPrescribedLoad: Builds a Prescribed load used by this file.
 * - buildSetInsertRow: Builds a Set insert row used by this file.
 * - buildSetTarget: Builds a Set target used by this file.
 * - buildSetActual: Builds a Set actual used by this file.
 * - computeProgress: Handles Compute progress for workout-state.service.js.
 * - buildWorkoutState: Builds a Workout state used by this file.
 * - stripIsoMilliseconds: Handles Strip iso milliseconds for workout-state.service.js.
 * - getWorkoutHistoryReferenceTimestamp: Gets Workout history reference timestamp needed by this file.
 * - getUtcOffsetMsForTimezone: Gets Utc offset ms for timezone needed by this file.
 * - getUtcInstantForDateKey: Gets Utc instant for date key needed by this file.
 * - buildUtcRangeForDateKeys: Builds an Utc range for date keys used by this file.
 * - normalizeWorkoutHistoryWindow: Normalizes Workout history window into the format this file expects.
 * - loadWorkoutSessionRowsForHistoryRange: Loads Workout session rows for history range for the surrounding workflow.
 * - loadWorkoutGraphsForSessions: Loads Workout graphs for sessions for the surrounding workflow.
 * - buildWorkoutHistorySummary: Builds a Workout history summary used by this file.
 * - getWorkoutSessionRow: Gets Workout session row needed by this file.
 * - getLiveWorkoutSessionRow: Gets Live workout session row needed by this file.
 * - resolveWorkoutSessionRow: Resolves Workout session row before the next step runs.
 * - loadWorkoutGraph: Loads Workout graph for the surrounding workflow.
 * - loadResolvedWorkoutGraph: Loads Resolved workout graph for the surrounding workflow.
 * - findWorkoutExerciseRow: Handles Find workout exercise row for workout-state.service.js.
 * - findWorkoutSetRow: Handles Find workout set row for workout-state.service.js.
 * - findFirstLiveExercise: Handles Find first live exercise for workout-state.service.js.
 * - getCurrentWorkoutState: Gets Current workout state needed by this file.
 * - getWorkoutHistory: Gets Workout history needed by this file.
 * - createWorkoutSessionFromDraft: Creates a Workout session from draft used by this file.
 * - updateWorkoutExerciseRow: Updates Workout exercise row with the latest state.
 * - updateWorkoutSetRow: Updates Workout set row with the latest state.
 * - updateWorkoutSessionRow: Updates Workout session row with the latest state.
 * - deleteWorkoutSessionRow: Handles Delete workout session row for workout-state.service.js.
 * - workoutSessionHasExercises: Handles Workout session has exercises for workout-state.service.js.
 * - insertWorkoutAdjustmentRows: Handles Insert workout adjustment rows for workout-state.service.js.
 * - deleteWorkoutSetsByExerciseId: Handles Delete workout sets by exercise ID for workout-state.service.js.
 * - insertDraftExercisesAndSets: Handles Insert draft exercises and sets for workout-state.service.js.
 * - combineNotes: Handles Combine notes for workout-state.service.js.
 * - resolveExerciseTerminalStatus: Resolves Exercise terminal status before the next step runs.
 * - findFirstPendingSetIndex: Handles Find first pending set index for workout-state.service.js.
 * - resolveAutomaticFlow: Resolves Automatic flow before the next step runs.
 * - resolveFlowDirective: Resolves Flow directive before the next step runs.
 * - markFutureNodeActiveIfNeeded: Marks Future node active if needed with the appropriate status.
 * - recordWorkoutSetResult: Records Workout set result for later use.
 * - hasExplicitFlow: Handles Has explicit flow for workout-state.service.js.
 * - normalizeDraftOrderIndexes: Normalizes Draft order indexes into the format this file expects.
 * - inferAdjustmentTypeFromTarget: Infers Adjustment type from target from the available inputs.
 * - rewriteRemainingWorkoutFromDraft: Handles Rewrite remaining workout from draft for workout-state.service.js.
 * - replaceWorkoutExerciseFromDraft: Replaces Workout exercise from draft with updated content.
 * - adjustWorkoutSetTargets: Handles Adjust workout set targets for workout-state.service.js.
 * - finishWorkoutSession: Finishes Workout session and closes out the workflow.
 * - startWorkoutSession: Starts Workout session for this module.
 * - pauseWorkoutSession: Handles Pause workout session for workout-state.service.js.
 * - resumeWorkoutSession: Handles Resume workout session for workout-state.service.js.
 * - skipWorkoutExercise: Handles Skip workout exercise for workout-state.service.js.
 */

const { env } = require('../../config/env');
const { getRedisConnection } = require('../../infra/redis/connection');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { parseWorkoutSessionState } = require('../schemas/workout.schema');
const { resolveSessionContinuityPolicy } = require('./session-reset-policy.service');
const { getDateKeyInTimezone, isValidDateKey, shiftDateKey } = require('./timezone-date.service');

const LIVE_WORKOUT_STATUSES = ['queued', 'in_progress', 'paused'];
const TERMINAL_EXERCISE_STATUSES = new Set(['completed', 'skipped', 'canceled']);
const TERMINAL_SET_STATUSES = new Set(['completed', 'skipped']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_WORKOUT_HISTORY_MAX_SESSIONS = 10;
const MAX_WORKOUT_HISTORY_MAX_SESSIONS = 31;
const DEFAULT_WORKOUT_IDLE_EXPIRY_MINUTES = 240;

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
 * Gets Redis or null needed by this file.
 */
function getRedisOrNull() {
  return getRedisConnection();
}

/**
 * Builds a Workout state session cache key used by this file.
 */
function buildWorkoutStateSessionCacheKey(userId, sessionKey) {
  return `workout-state:session:${userId}:${sessionKey}`;
}

/**
 * Builds a Workout state ID cache key used by this file.
 */
function buildWorkoutStateIdCacheKey(userId, workoutSessionId) {
  return `workout-state:id:${userId}:${workoutSessionId}`;
}

/**
 * Gets Cached workout state needed by this file.
 */
async function getCachedWorkoutState({ userId, sessionKey, workoutSessionId }) {
  const redis = getRedisOrNull();
  const cacheKey = workoutSessionId
    ? buildWorkoutStateIdCacheKey(userId, workoutSessionId)
    : (sessionKey ? buildWorkoutStateSessionCacheKey(userId, sessionKey) : null);

  if (!redis || !cacheKey) {
    return null;
  }

  const raw = await redis.get(cacheKey);
  if (!raw) {
    return null;
  }

  const state = parseWorkoutSessionState(JSON.parse(raw));

  // Older cache payloads did not include the session timestamp we need to enforce
  // workout idle expiry, so treat them as cache misses and refresh from the DB.
  if (LIVE_WORKOUT_STATUSES.includes(state.status) && !state.updatedAt) {
    await redis.del(cacheKey);
    return null;
  }

  return state;
}

/**
 * Handles Evict workout state cache for workout-state.service.js.
 */
async function evictWorkoutStateCache({ userId, sessionKey, workoutSessionId }) {
  const redis = getRedisOrNull();
  if (!redis) {
    return;
  }

  const keys = [];

  if (sessionKey) {
    keys.push(buildWorkoutStateSessionCacheKey(userId, sessionKey));
  }

  if (workoutSessionId) {
    keys.push(buildWorkoutStateIdCacheKey(userId, workoutSessionId));
  }

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Handles Cache workout state for workout-state.service.js.
 */
async function cacheWorkoutState(state, userIdOverride = null) {
  if (!state || !LIVE_WORKOUT_STATUSES.includes(state.status)) {
    await evictWorkoutStateCache({
      userId: userIdOverride,
      sessionKey: state ? state.sessionKey : null,
      workoutSessionId: state ? state.workoutSessionId : null
    });
    return;
  }

  const redis = getRedisOrNull();
  const userId = userIdOverride;

  if (!redis || !userId) {
    return;
  }

  const payload = JSON.stringify(state);
  const ttlSec = Math.max(60, env.workoutStateCacheTtlSec || 900);
  const multi = redis.multi();

  if (state.sessionKey) {
    multi.set(buildWorkoutStateSessionCacheKey(userId, state.sessionKey), payload, 'EX', ttlSec);
  }

  if (state.workoutSessionId) {
    multi.set(buildWorkoutStateIdCacheKey(userId, state.workoutSessionId), payload, 'EX', ttlSec);
  }

  await multi.exec();
}

/**
 * Builds an Error used by this file.
 */
function buildError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Coerces State version into the expected type.
 */
function coerceStateVersion(value) {
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * Builds a Next state version used by this file.
 */
function buildNextStateVersion(session) {
  return coerceStateVersion(session && session.state_version) + 1;
}

/**
 * Normalizes Idle expiry minutes into the format this file expects.
 */
function normalizeIdleExpiryMinutes(value, fallback = DEFAULT_WORKOUT_IDLE_EXPIRY_MINUTES) {
  const coerced = Number(value);

  if (!Number.isFinite(coerced)) {
    return fallback;
  }

  return Math.max(0, Math.floor(coerced));
}

/**
 * Resolves Workout idle expiry minutes before the next step runs.
 */
async function resolveWorkoutIdleExpiryMinutes(userId) {
  if (!userId) {
    return DEFAULT_WORKOUT_IDLE_EXPIRY_MINUTES;
  }

  try {
    const policy = await resolveSessionContinuityPolicy(userId);
    return normalizeIdleExpiryMinutes(policy ? policy.idleExpiryMinutes : null);
  } catch (error) {
    console.warn('Workout idle expiry policy lookup failed:', error.message);
    return DEFAULT_WORKOUT_IDLE_EXPIRY_MINUTES;
  }
}

/**
 * Gets Workout session last touched at needed by this file.
 */
function getWorkoutSessionLastTouchedAt(session) {
  return (
    (session && (session.updated_at || session.updatedAt)) ||
    (session && (session.started_at || session.startedAt)) ||
    (session && (session.created_at || session.createdAt)) ||
    null
  );
}

/**
 * Handles Is workout session expired for workout-state.service.js.
 */
function isWorkoutSessionExpired({ session, idleExpiryMinutes, now = new Date() }) {
  if (!session || !LIVE_WORKOUT_STATUSES.includes(session.status)) {
    return false;
  }

  const normalizedIdleExpiryMinutes = normalizeIdleExpiryMinutes(idleExpiryMinutes);
  if (normalizedIdleExpiryMinutes <= 0) {
    return false;
  }

  const lastTouchedAt = getWorkoutSessionLastTouchedAt(session);
  if (!lastTouchedAt) {
    return false;
  }

  const lastTouchedMs = Date.parse(lastTouchedAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  if (!Number.isFinite(lastTouchedMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  return lastTouchedMs <= nowMs - (normalizedIdleExpiryMinutes * 60 * 1000);
}

/**
 * Builds an Abandoned workout summary used by this file.
 */
function buildAbandonedWorkoutSummary(summary, { abandonedAt, idleExpiryMinutes, lastTouchedAt }) {
  return {
    ...(summary && typeof summary === 'object' ? summary : {}),
    abandonment: {
      reason: 'idle_timeout',
      abandonedAt,
      idleExpiryMinutes,
      lastTouchedAt
    }
  };
}

/**
 * Handles Expire stale workout session if needed for workout-state.service.js.
 */
async function expireStaleWorkoutSessionIfNeeded({
  userId,
  session,
  returnNullWhenExpired = false,
  idleExpiryMinutes = null
}) {
  if (!session || !LIVE_WORKOUT_STATUSES.includes(session.status)) {
    return session;
  }

  const effectiveIdleExpiryMinutes = idleExpiryMinutes != null
    ? normalizeIdleExpiryMinutes(idleExpiryMinutes)
    : await resolveWorkoutIdleExpiryMinutes(userId);

  if (!isWorkoutSessionExpired({
    session,
    idleExpiryMinutes: effectiveIdleExpiryMinutes
  })) {
    return session;
  }

  const abandonedAt = new Date().toISOString();
  const updatedSession = await updateWorkoutSessionRow(session.workout_session_id, {
    state_version: buildNextStateVersion(session),
    status: 'abandoned',
    current_phase: 'finished',
    summary_json: buildAbandonedWorkoutSummary(session.summary_json, {
      abandonedAt,
      idleExpiryMinutes: effectiveIdleExpiryMinutes,
      lastTouchedAt: getWorkoutSessionLastTouchedAt(session)
    }),
    completed_at: null
  });

  try {
    await evictWorkoutStateCache({
      userId,
      sessionKey: updatedSession.session_key,
      workoutSessionId: updatedSession.workout_session_id
    });
  } catch (error) {
    console.warn('Workout state cache eviction failed:', error.message);
  }

  return returnNullWhenExpired ? null : updatedSession;
}

/**
 * Handles Assert expected state version for workout-state.service.js.
 */
function assertExpectedStateVersion(session, expectedStateVersion) {
  if (expectedStateVersion == null) {
    return;
  }

  const currentStateVersion = coerceStateVersion(session && session.state_version);

  if (expectedStateVersion !== currentStateVersion) {
    throw buildError('STALE_WORKOUT_STATE', {
      workoutSessionId: session ? session.workout_session_id : null,
      expectedStateVersion,
      currentStateVersion
    });
  }
}

/**
 * Normalizes Exercise name into the format this file expects.
 */
function normalizeExerciseName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Handles Is UUID for workout-state.service.js.
 */
function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

/**
 * Handles Is current reference for workout-state.service.js.
 */
function isCurrentReference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'current' || normalized === 'active';
}

/**
 * Normalizes Reference token into the format this file expects.
 */
function normalizeReferenceToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolves Exercise definition ID before the next step runs.
 */
function resolveExerciseDefinitionId(value) {
  return isUuid(value) ? String(value).trim() : null;
}

/**
 * Builds an Exercise key used by this file.
 */
function buildExerciseKey(draft) {
  if (draft.exerciseKey && String(draft.exerciseKey).trim()) {
    return String(draft.exerciseKey).trim().toLowerCase();
  }

  if (draft.exerciseId && !isUuid(draft.exerciseId)) {
    const normalizedFallback = normalizeReferenceToken(draft.exerciseId);

    if (normalizedFallback) {
      return normalizedFallback;
    }
  }

  return normalizeExerciseName(draft.exerciseName).replace(/\s+/g, '-');
}

/**
 * Builds a Session guidance payload used by this file.
 */
function buildSessionGuidancePayload(input) {
  return {
    ...(input.guidance || {}),
    decision: input.decision || null,
    startMode: input.startMode || null
  };
}

/**
 * Builds a Session summary payload used by this file.
 */
function buildSessionSummaryPayload(input) {
  return {
    ...(input.summary || {})
  };
}

/**
 * Builds an Exercise prescription payload used by this file.
 */
function buildExercisePrescriptionPayload(draft) {
  return {
    ...(draft.prescription || {}),
    displayName: draft.displayName || draft.exerciseName,
    authoredSets: (draft.sets || []).map(set => ({
      setIndex: set.setIndex,
      target: set.target || {},
      notes: set.notes || null
    })),
    metadata: draft.metadata || {}
  };
}

/**
 * Builds a Set notes used by this file.
 */
function buildSetNotes(draftSet) {
  const noteParts = [];

  if (draftSet.notes) {
    noteParts.push(String(draftSet.notes).trim());
  }

  if (draftSet.target && draftSet.target.instruction) {
    noteParts.push(String(draftSet.target.instruction).trim());
  }

  const joined = noteParts.filter(Boolean).join('\n');
  return joined || null;
}

/**
 * Builds a Prescribed load used by this file.
 */
function buildPrescribedLoad(target) {
  if (target.load && typeof target.load.value === 'number') {
    return target.load.value;
  }

  if (
    target.loadPrescription &&
    target.loadPrescription.mode === 'exact' &&
    typeof target.loadPrescription.value === 'number'
  ) {
    return target.loadPrescription.value;
  }

  return null;
}

/**
 * Builds a Set insert row used by this file.
 */
function buildSetInsertRow({ workoutExerciseId, draftSet, status, startedAt }) {
  const target = draftSet.target || {};

  return {
    workout_exercise_id: workoutExerciseId,
    set_index: draftSet.setIndex,
    status,
    prescribed_reps: Number.isInteger(target.reps) ? target.reps : null,
    prescribed_load: buildPrescribedLoad(target),
    prescribed_duration_sec: Number.isInteger(target.durationSec) ? target.durationSec : null,
    prescribed_distance_m: Number.isInteger(target.distanceM) ? target.distanceM : null,
    prescribed_rpe: typeof target.rpe === 'number' ? target.rpe : null,
    notes: buildSetNotes(draftSet),
    started_at: status === 'active' ? startedAt : null,
    completed_at: null
  };
}

/**
 * Builds a Set target used by this file.
 */
function buildSetTarget(row, authoredSet, exercise, session) {
  const authoredTarget = (authoredSet && authoredSet.target) || {};
  const loadUnit = (
    (authoredTarget.load && authoredTarget.load.unit) ||
    (authoredTarget.loadPrescription && authoredTarget.loadPrescription.unit) ||
    (session.guidance && session.guidance.weightUnit) ||
    null
  );

  return {
    ...authoredTarget,
    reps: row.prescribed_reps ?? authoredTarget.reps ?? null,
    load: row.prescribed_load != null
      ? {
          value: Number(row.prescribed_load),
          unit: loadUnit
        }
      : authoredTarget.load || null,
    durationSec: row.prescribed_duration_sec ?? authoredTarget.durationSec ?? null,
    distanceM: row.prescribed_distance_m ?? authoredTarget.distanceM ?? null,
    rpe: row.prescribed_rpe != null ? Number(row.prescribed_rpe) : (authoredTarget.rpe ?? null),
    restSec: authoredTarget.restSec ?? exercise.prescription.restSec ?? null,
    tempo: authoredTarget.tempo ?? exercise.prescription.tempo ?? null
  };
}

/**
 * Builds a Set actual used by this file.
 */
function buildSetActual(row, target) {
  return {
    reps: row.actual_reps ?? null,
    load: row.actual_load != null
      ? {
          value: Number(row.actual_load),
          unit: target.load ? target.load.unit || null : null
        }
      : null,
    durationSec: row.actual_duration_sec ?? null,
    distanceM: row.actual_distance_m ?? null,
    rpe: row.actual_rpe != null ? Number(row.actual_rpe) : null,
    side: null
  };
}

/**
 * Handles Compute progress for workout-state.service.js.
 */
function computeProgress(exercises) {
  const totalExercises = exercises.length;
  const completedExercises = exercises.filter(exercise => TERMINAL_EXERCISE_STATUSES.has(exercise.status)).length;
  const allSets = exercises.flatMap(exercise => exercise.sets);
  const totalSets = allSets.length;
  const completedSets = allSets.filter(set => TERMINAL_SET_STATUSES.has(set.status)).length;

  return {
    completedExercises,
    totalExercises,
    completedSets,
    totalSets,
    remainingExercises: Math.max(totalExercises - completedExercises, 0)
  };
}

/**
 * Builds a Workout state used by this file.
 */
function buildWorkoutState({ session, exercises, sets, adjustments }) {
  const setsByExerciseId = new Map();
  for (const row of sets) {
    const list = setsByExerciseId.get(row.workout_exercise_id) || [];
    list.push(row);
    setsByExerciseId.set(row.workout_exercise_id, list);
  }

  const adjustmentsByExerciseId = new Map();
  for (const row of adjustments) {
    const list = adjustmentsByExerciseId.get(row.workout_exercise_id) || [];
    list.push(row);
    adjustmentsByExerciseId.set(row.workout_exercise_id, list);
  }

  const exerciseStates = exercises.map(exerciseRow => {
    const prescription = exerciseRow.prescription_json || {};
    const authoredSets = new Map(
      ((prescription.authoredSets || [])).map(set => [set.setIndex, set])
    );
    const setStates = (setsByExerciseId.get(exerciseRow.workout_exercise_id) || [])
      .sort((left, right) => left.set_index - right.set_index)
      .map(setRow => {
        const target = buildSetTarget(setRow, authoredSets.get(setRow.set_index), {
          prescription
        }, {
          guidance: session.guidance_json || {}
        });

        return {
          workoutSetId: setRow.workout_set_id,
          setIndex: setRow.set_index,
          status: setRow.status,
          target,
          actual: buildSetActual(setRow, target),
          notes: setRow.notes || null,
          startedAt: setRow.started_at,
          completedAt: setRow.completed_at
        };
      });

    return {
      workoutExerciseId: exerciseRow.workout_exercise_id,
      workoutSessionId: exerciseRow.workout_session_id,
      orderIndex: exerciseRow.order_index,
      exerciseId: exerciseRow.exercise_id,
      exerciseKey: exerciseRow.exercise_key,
      exerciseName: exerciseRow.exercise_name_raw || prescription.displayName || exerciseRow.exercise_key || 'Exercise',
      displayName: prescription.displayName || exerciseRow.exercise_name_raw || exerciseRow.exercise_key || 'Exercise',
      status: exerciseRow.status,
      prescription,
      coachMessage: exerciseRow.coach_message || null,
      startedAt: exerciseRow.started_at,
      completedAt: exerciseRow.completed_at,
      sets: setStates,
      adjustments: (adjustmentsByExerciseId.get(exerciseRow.workout_exercise_id) || []).map(row => ({
        adjustmentId: row.adjustment_id,
        workoutExerciseId: row.workout_exercise_id,
        setIndex: row.set_index,
        adjustmentType: row.adjustment_type,
        source: row.source,
        reason: row.reason || null,
        before: row.before_json || null,
        after: row.after_json || null,
        createdAt: row.created_at
      }))
    };
  });

  const currentExercise = exerciseStates.find(entry => entry.orderIndex === session.current_exercise_index) || null;

  return parseWorkoutSessionState({
    workoutSessionId: session.workout_session_id,
    sessionKey: session.session_key,
    stateVersion: coerceStateVersion(session.state_version),
    status: session.status,
    currentPhase: session.current_phase,
    title: session.title || null,
    guidance: session.guidance_json || {},
    summary: session.summary_json || {},
    currentExerciseIndex: session.current_exercise_index,
    currentSetIndex: session.current_set_index,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    updatedAt: session.updated_at,
    currentExerciseId: currentExercise ? currentExercise.workoutExerciseId : null,
    progress: computeProgress(exerciseStates),
    exercises: exerciseStates
  });
}

/**
 * Handles Strip iso milliseconds for workout-state.service.js.
 */
function stripIsoMilliseconds(value) {
  return String(value || '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Gets Workout history reference timestamp needed by this file.
 */
function getWorkoutHistoryReferenceTimestamp(session) {
  return session.completed_at || session.started_at || session.created_at || null;
}

/**
 * Gets Utc offset ms for timezone needed by this file.
 */
function getUtcOffsetMsForTimezone(value, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(value);
  const mapped = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  let year = Number(mapped.year);
  let month = Number(mapped.month);
  let day = Number(mapped.day);
  let hour = Number(mapped.hour);

  if (hour === 24) {
    hour = 0;
    const normalizedDate = new Date(Date.UTC(year, month - 1, day));
    normalizedDate.setUTCDate(normalizedDate.getUTCDate() + 1);
    year = normalizedDate.getUTCFullYear();
    month = normalizedDate.getUTCMonth() + 1;
    day = normalizedDate.getUTCDate();
  }

  const asUtcTime = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    Number(mapped.minute),
    Number(mapped.second)
  );

  return asUtcTime - value.getTime();
}

/**
 * Gets Utc instant for date key needed by this file.
 */
function getUtcInstantForDateKey(dateKey, timezone) {
  if (!isValidDateKey(dateKey)) {
    throw buildError('INVALID_WORKOUT_HISTORY_DATE', {
      dateKey
    });
  }

  const [year, month, day] = String(dateKey).split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const initialOffset = getUtcOffsetMsForTimezone(new Date(utcGuess), timezone);
  let resolvedTime = utcGuess - initialOffset;
  const correctedOffset = getUtcOffsetMsForTimezone(new Date(resolvedTime), timezone);

  if (correctedOffset !== initialOffset) {
    resolvedTime = utcGuess - correctedOffset;
  }

  return new Date(resolvedTime);
}

/**
 * Builds an Utc range for date keys used by this file.
 */
function buildUtcRangeForDateKeys({ startDateKey, endDateKey, timezone }) {
  return {
    startIso: stripIsoMilliseconds(getUtcInstantForDateKey(startDateKey, timezone).toISOString()),
    endExclusiveIso: stripIsoMilliseconds(
      getUtcInstantForDateKey(shiftDateKey(endDateKey, 1), timezone).toISOString()
    )
  };
}

/**
 * Normalizes Workout history window into the format this file expects.
 */
function normalizeWorkoutHistoryWindow(input = {}) {
  const hasDate = typeof input.date === 'string' && String(input.date).trim().length > 0;
  const hasStartDate = typeof input.startDate === 'string' && String(input.startDate).trim().length > 0;
  const hasEndDate = typeof input.endDate === 'string' && String(input.endDate).trim().length > 0;

  if (hasDate && (hasStartDate || hasEndDate)) {
    throw buildError('INVALID_WORKOUT_HISTORY_WINDOW', {
      reason: 'Provide either date or startDate/endDate, not both.'
    });
  }

  if (!hasDate && !(hasStartDate && hasEndDate)) {
    throw buildError('INVALID_WORKOUT_HISTORY_WINDOW', {
      reason: 'Provide either date or both startDate and endDate.'
    });
  }

  const startDate = hasDate ? String(input.date).trim() : String(input.startDate).trim();
  const endDate = hasDate ? String(input.date).trim() : String(input.endDate).trim();

  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    throw buildError('INVALID_WORKOUT_HISTORY_DATE', {
      startDate,
      endDate
    });
  }

  if (startDate > endDate) {
    throw buildError('INVALID_WORKOUT_HISTORY_WINDOW', {
      startDate,
      endDate,
      reason: 'startDate must be on or before endDate.'
    });
  }

  return {
    requestedMode: hasDate ? 'single_date' : 'date_range',
    startDate,
    endDate,
    includeLiveSessions: input.includeLiveSessions === true,
    maxSessions: Number.isInteger(input.maxSessions)
      ? Math.min(Math.max(input.maxSessions, 1), MAX_WORKOUT_HISTORY_MAX_SESSIONS)
      : DEFAULT_WORKOUT_HISTORY_MAX_SESSIONS
  };
}

/**
 * Loads Workout session rows for history range for the surrounding workflow.
 */
async function loadWorkoutSessionRowsForHistoryRange({ userId, startIso, endExclusiveIso }) {
  const supabase = getAdminClientOrThrow();
  const [
    completedResult,
    startedResult,
    createdResult
  ] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .gte('completed_at', startIso)
      .lt('completed_at', endExclusiveIso),
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('completed_at', null)
      .not('started_at', 'is', null)
      .gte('started_at', startIso)
      .lt('started_at', endExclusiveIso),
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('completed_at', null)
      .is('started_at', null)
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso)
  ]);

  if (completedResult.error) {
    throw completedResult.error;
  }

  if (startedResult.error) {
    throw startedResult.error;
  }

  if (createdResult.error) {
    throw createdResult.error;
  }

  const rowsById = new Map();

  for (const row of [
    ...(completedResult.data || []),
    ...(startedResult.data || []),
    ...(createdResult.data || [])
  ]) {
    rowsById.set(row.workout_session_id, row);
  }

  return [...rowsById.values()];
}

/**
 * Loads Workout graphs for sessions for the surrounding workflow.
 */
async function loadWorkoutGraphsForSessions(sessionRows) {
  if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
    return [];
  }

  const supabase = getAdminClientOrThrow();
  const sessionIds = sessionRows.map(row => row.workout_session_id);
  const { data: exercises, error: exercisesError } = await supabase
    .from('workout_exercises')
    .select('*')
    .in('workout_session_id', sessionIds)
    .order('order_index', { ascending: true });

  if (exercisesError) {
    throw exercisesError;
  }

  const exerciseIds = (exercises || []).map(row => row.workout_exercise_id);
  let sets = [];
  let adjustments = [];

  if (exerciseIds.length > 0) {
    const [{ data: setRows, error: setsError }, { data: adjustmentRows, error: adjustmentsError }] = await Promise.all([
      supabase
        .from('workout_sets')
        .select('*')
        .in('workout_exercise_id', exerciseIds)
        .order('set_index', { ascending: true }),
      supabase
        .from('workout_adjustments')
        .select('*')
        .in('workout_exercise_id', exerciseIds)
        .order('created_at', { ascending: true })
    ]);

    if (setsError) {
      throw setsError;
    }

    if (adjustmentsError) {
      throw adjustmentsError;
    }

    sets = setRows || [];
    adjustments = adjustmentRows || [];
  }

  const exercisesBySessionId = new Map();
  const setsByExerciseId = new Map();
  const adjustmentsByExerciseId = new Map();

  for (const row of exercises || []) {
    const list = exercisesBySessionId.get(row.workout_session_id) || [];
    list.push(row);
    exercisesBySessionId.set(row.workout_session_id, list);
  }

  for (const row of sets) {
    const list = setsByExerciseId.get(row.workout_exercise_id) || [];
    list.push(row);
    setsByExerciseId.set(row.workout_exercise_id, list);
  }

  for (const row of adjustments) {
    const list = adjustmentsByExerciseId.get(row.workout_exercise_id) || [];
    list.push(row);
    adjustmentsByExerciseId.set(row.workout_exercise_id, list);
  }

  return sessionRows.map(session => {
    const sessionExercises = (exercisesBySessionId.get(session.workout_session_id) || [])
      .sort((left, right) => left.order_index - right.order_index);
    const sessionSets = sessionExercises.flatMap(row => setsByExerciseId.get(row.workout_exercise_id) || []);
    const sessionAdjustments = sessionExercises.flatMap(
      row => adjustmentsByExerciseId.get(row.workout_exercise_id) || []
    );

    return {
      session,
      exercises: sessionExercises,
      sets: sessionSets,
      adjustments: sessionAdjustments
    };
  });
}

/**
 * Builds a Workout history summary used by this file.
 */
function buildWorkoutHistorySummary(sessions) {
  const statusCounts = {};
  let totalExercises = 0;
  let completedExercises = 0;
  let totalSets = 0;
  let completedSets = 0;

  for (const entry of sessions) {
    const workout = entry.workout;
    statusCounts[workout.status] = (statusCounts[workout.status] || 0) + 1;
    totalExercises += workout.progress.totalExercises;
    completedExercises += workout.progress.completedExercises;
    totalSets += workout.progress.totalSets;
    completedSets += workout.progress.completedSets;
  }

  return {
    totalSessions: sessions.length,
    statusCounts,
    totalExercises,
    completedExercises,
    totalSets,
    completedSets
  };
}

/**
 * Gets Workout session row needed by this file.
 */
async function getWorkoutSessionRow({ userId, workoutSessionId, liveOnly = false }) {
  const supabase = getAdminClientOrThrow();
  let query = supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('workout_session_id', workoutSessionId);

  if (liveOnly) {
    query = query.in('status', LIVE_WORKOUT_STATUSES);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return expireStaleWorkoutSessionIfNeeded({
    userId,
    session: data || null,
    returnNullWhenExpired: liveOnly
  });
}

/**
 * Gets Live workout session row needed by this file.
 */
async function getLiveWorkoutSessionRow({ userId, sessionKey }) {
  const supabase = getAdminClientOrThrow();
  let query = supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', LIVE_WORKOUT_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (sessionKey) {
    query = query.eq('session_key', sessionKey);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return expireStaleWorkoutSessionIfNeeded({
    userId,
    session: data || null,
    returnNullWhenExpired: true
  });
}

/**
 * Resolves Workout session row before the next step runs.
 */
async function resolveWorkoutSessionRow({ userId, sessionKey, workoutSessionId, liveOnly = false }) {
  if (!workoutSessionId || isCurrentReference(workoutSessionId)) {
    return getLiveWorkoutSessionRow({
      userId,
      sessionKey
    });
  }

  if (!isUuid(workoutSessionId)) {
    return null;
  }

  return getWorkoutSessionRow({
    userId,
    workoutSessionId: String(workoutSessionId).trim(),
    liveOnly
  });
}

/**
 * Loads Workout graph for the surrounding workflow.
 */
async function loadWorkoutGraph({ userId, workoutSessionId }) {
  const supabase = getAdminClientOrThrow();
  const session = await getWorkoutSessionRow({
    userId,
    workoutSessionId,
    liveOnly: false
  });

  if (!session) {
    return null;
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_session_id', workoutSessionId)
    .order('order_index', { ascending: true });

  if (exercisesError) {
    throw exercisesError;
  }

  const exerciseIds = (exercises || []).map(row => row.workout_exercise_id);
  let sets = [];
  let adjustments = [];

  if (exerciseIds.length > 0) {
    const [{ data: setRows, error: setsError }, { data: adjustmentRows, error: adjustmentsError }] = await Promise.all([
      supabase
        .from('workout_sets')
        .select('*')
        .in('workout_exercise_id', exerciseIds)
        .order('set_index', { ascending: true }),
      supabase
        .from('workout_adjustments')
        .select('*')
        .in('workout_exercise_id', exerciseIds)
        .order('created_at', { ascending: true })
    ]);

    if (setsError) {
      throw setsError;
    }

    if (adjustmentsError) {
      throw adjustmentsError;
    }

    sets = setRows || [];
    adjustments = adjustmentRows || [];
  }

  return {
    session,
    exercises: exercises || [],
    sets,
    adjustments
  };
}

/**
 * Loads Resolved workout graph for the surrounding workflow.
 */
async function loadResolvedWorkoutGraph({ userId, sessionKey, workoutSessionId, liveOnly = false }) {
  const session = await resolveWorkoutSessionRow({
    userId,
    sessionKey,
    workoutSessionId,
    liveOnly
  });

  if (!session) {
    return null;
  }

  const graph = await loadWorkoutGraph({
    userId,
    workoutSessionId: session.workout_session_id
  });

  if (
    graph &&
    LIVE_WORKOUT_STATUSES.includes(graph.session.status) &&
    Array.isArray(graph.exercises) &&
    graph.exercises.length === 0
  ) {
    await evictWorkoutStateCache({
      userId,
      sessionKey: graph.session.session_key,
      workoutSessionId: graph.session.workout_session_id
    });
    await deleteWorkoutSessionRow(graph.session.workout_session_id);
    return null;
  }

  return graph;
}

/**
 * Handles Find workout exercise row for workout-state.service.js.
 */
function findWorkoutExerciseRow(graph, workoutExerciseRef) {
  if (!graph || !Array.isArray(graph.exercises) || !workoutExerciseRef) {
    return null;
  }

  if (isCurrentReference(workoutExerciseRef)) {
    return (
      graph.exercises.find(row => row.order_index === graph.session.current_exercise_index) ||
      graph.exercises.find(row => row.status === 'active') ||
      graph.exercises.find(row => row.status === 'pending') ||
      null
    );
  }

  if (isUuid(workoutExerciseRef)) {
    return graph.exercises.find(row => row.workout_exercise_id === String(workoutExerciseRef).trim()) || null;
  }

  const normalizedRef = normalizeReferenceToken(workoutExerciseRef);
  const normalizedName = normalizeExerciseName(workoutExerciseRef);

  return (
    graph.exercises.find(row => String(row.exercise_key || '').trim().toLowerCase() === normalizedRef) ||
    graph.exercises.find(row => String(row.exercise_name_normalized || '').trim().toLowerCase() === normalizedName) ||
    graph.exercises.find(row => String(row.exercise_name_raw || '').trim().toLowerCase() === String(workoutExerciseRef).trim().toLowerCase()) ||
    null
  );
}

/**
 * Handles Find workout set row for workout-state.service.js.
 */
function findWorkoutSetRow(graph, workoutExerciseId, setIndex) {
  if (!graph || !Array.isArray(graph.sets)) {
    return null;
  }

  return graph.sets.find(row => (
    row.workout_exercise_id === workoutExerciseId &&
    row.set_index === setIndex
  )) || null;
}

/**
 * Handles Find first live exercise for workout-state.service.js.
 */
function findFirstLiveExercise(graph) {
  if (!graph || !Array.isArray(graph.exercises)) {
    return null;
  }

  return (
    graph.exercises.find(row => row.order_index === graph.session.current_exercise_index) ||
    graph.exercises.find(row => row.status === 'active') ||
    graph.exercises.find(row => !TERMINAL_EXERCISE_STATUSES.has(row.status)) ||
    null
  );
}

/**
 * Gets Current workout state needed by this file.
 */
async function getCurrentWorkoutState({ userId, sessionKey, workoutSessionId, bypassCache = false }) {
  if (!bypassCache) {
    try {
      const cached = await getCachedWorkoutState({
        userId,
        sessionKey,
        workoutSessionId
      });

      if (cached) {
        const idleExpiryMinutes = await resolveWorkoutIdleExpiryMinutes(userId);

        if (!isWorkoutSessionExpired({ session: cached, idleExpiryMinutes })) {
          return cached;
        }

        await evictWorkoutStateCache({
          userId,
          sessionKey,
          workoutSessionId
        });
      }
    } catch (error) {
      console.warn('Workout state cache read failed:', error.message);
    }
  }

  const graph = await loadResolvedWorkoutGraph({
    userId,
    sessionKey,
    workoutSessionId
  });

  if (!graph) {
    try {
      await evictWorkoutStateCache({
        userId,
        sessionKey,
        workoutSessionId
      });
    } catch (error) {
      console.warn('Workout state cache eviction failed:', error.message);
    }
    return null;
  }

  const state = buildWorkoutState(graph);

  try {
    await cacheWorkoutState(state, userId);
  } catch (error) {
    console.warn('Workout state cache write failed:', error.message);
  }

  return state;
}

/**
 * Gets Workout history needed by this file.
 */
async function getWorkoutHistory({ userId, input }) {
  const normalizedWindow = normalizeWorkoutHistoryWindow(input || {});
  const continuityPolicy = await resolveSessionContinuityPolicy(userId);
  const timezone = continuityPolicy ? continuityPolicy.timezone : 'UTC';
  const { startIso, endExclusiveIso } = buildUtcRangeForDateKeys({
    startDateKey: normalizedWindow.startDate,
    endDateKey: normalizedWindow.endDate,
    timezone
  });
  const candidateSessions = await loadWorkoutSessionRowsForHistoryRange({
    userId,
    startIso,
    endExclusiveIso
  });
  const matchingSessions = candidateSessions
    .flatMap(row => {
      const referenceTimestamp = getWorkoutHistoryReferenceTimestamp(row);

      if (!referenceTimestamp) {
        return [];
      }

      if (!normalizedWindow.includeLiveSessions && LIVE_WORKOUT_STATUSES.includes(row.status)) {
        return [];
      }

      const sessionDate = getDateKeyInTimezone(referenceTimestamp, timezone);

      if (sessionDate < normalizedWindow.startDate || sessionDate > normalizedWindow.endDate) {
        return [];
      }

      return [{
        row,
        sessionDate,
        referenceTimestamp
      }];
    })
    .sort((left, right) => {
      const timestampDelta = new Date(right.referenceTimestamp).getTime() - new Date(left.referenceTimestamp).getTime();

      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return new Date(right.row.created_at).getTime() - new Date(left.row.created_at).getTime();
    });
  const hasMore = matchingSessions.length > normalizedWindow.maxSessions;
  const selectedSessions = matchingSessions.slice(0, normalizedWindow.maxSessions);
  const graphs = await loadWorkoutGraphsForSessions(selectedSessions.map(entry => entry.row));
  const graphsBySessionId = new Map(
    graphs.map(graph => [graph.session.workout_session_id, graph])
  );
  const sessions = selectedSessions.map(entry => {
    const graph = graphsBySessionId.get(entry.row.workout_session_id) || {
      session: entry.row,
      exercises: [],
      sets: [],
      adjustments: []
    };

    return {
      sessionDate: entry.sessionDate,
      referenceTimestamp: entry.referenceTimestamp,
      workout: buildWorkoutState(graph)
    };
  });

  return {
    timezone,
    window: {
      requestedMode: normalizedWindow.requestedMode,
      startDate: normalizedWindow.startDate,
      endDate: normalizedWindow.endDate,
      includeLiveSessions: normalizedWindow.includeLiveSessions,
      maxSessions: normalizedWindow.maxSessions,
      returnedSessions: sessions.length,
      hasMore
    },
    summary: buildWorkoutHistorySummary(sessions),
    sessions
  };
}

/**
 * Creates a Workout session from draft used by this file.
 */
async function createWorkoutSessionFromDraft({ userId, sessionKey, runId, input }) {
  const supabase = getAdminClientOrThrow();
  let existingLiveWorkout = await getLiveWorkoutSessionRow({
    userId
  });

  if (existingLiveWorkout) {
    const hasExercises = await workoutSessionHasExercises(existingLiveWorkout.workout_session_id);

    if (!hasExercises) {
      await evictWorkoutStateCache({
        userId,
        sessionKey: existingLiveWorkout.session_key,
        workoutSessionId: existingLiveWorkout.workout_session_id
      });
      await deleteWorkoutSessionRow(existingLiveWorkout.workout_session_id);
      existingLiveWorkout = null;
    }
  }

  if (existingLiveWorkout) {
    throw buildError('ACTIVE_WORKOUT_EXISTS', {
      workoutSessionId: existingLiveWorkout.workout_session_id,
      status: existingLiveWorkout.status,
      title: existingLiveWorkout.title || null
    });
  }

  const startedAt = new Date().toISOString();
  const startImmediately = input.startMode === 'start_immediately';
  const sessionInsert = {
    user_id: userId,
    session_key: sessionKey,
    originating_run_id: runId,
    state_version: 1,
    status: startImmediately ? 'in_progress' : 'queued',
    current_phase: startImmediately ? 'exercise' : 'preview',
    title: input.title || null,
    guidance_json: buildSessionGuidancePayload(input),
    summary_json: buildSessionSummaryPayload(input),
    current_exercise_index: input.exercises[0].orderIndex,
    current_set_index: input.exercises[0].sets[0].setIndex,
    started_at: startImmediately ? startedAt : null,
    completed_at: null
  };

  let session = null;

  try {
    const { data: insertedSession, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert(sessionInsert)
      .select('*')
      .single();

    if (sessionError) {
      throw sessionError;
    }

    session = insertedSession;

    const exerciseRows = input.exercises.map((draft, index) => ({
      workout_session_id: session.workout_session_id,
      exercise_id: resolveExerciseDefinitionId(draft.exerciseId),
      exercise_key: buildExerciseKey(draft),
      exercise_name_raw: draft.exerciseName,
      exercise_name_normalized: normalizeExerciseName(draft.exerciseName),
      order_index: draft.orderIndex,
      status: startImmediately && index === 0 ? 'active' : 'pending',
      prescription_json: buildExercisePrescriptionPayload(draft),
      coach_message: draft.coachMessage || null,
      started_at: startImmediately && index === 0 ? startedAt : null,
      completed_at: null
    }));

    const { data: insertedExercises, error: exercisesError } = await supabase
      .from('workout_exercises')
      .insert(exerciseRows)
      .select('*');

    if (exercisesError) {
      throw exercisesError;
    }

    const exerciseIdByOrderIndex = new Map(
      (insertedExercises || []).map(row => [row.order_index, row.workout_exercise_id])
    );

    const setRows = input.exercises.flatMap((draft, exerciseIndex) => {
      const workoutExerciseId = exerciseIdByOrderIndex.get(draft.orderIndex);

      return draft.sets.map((draftSet, setIndex) => buildSetInsertRow({
        workoutExerciseId,
        draftSet,
        status: startImmediately && exerciseIndex === 0 && setIndex === 0 ? 'active' : 'pending',
        startedAt
      }));
    });

    const { error: setsError } = await supabase
      .from('workout_sets')
      .insert(setRows);

    if (setsError) {
      throw setsError;
    }

    return getCurrentWorkoutState({
      userId,
      workoutSessionId: session.workout_session_id,
      bypassCache: true
    });
  } catch (error) {
    if (session && session.workout_session_id) {
      await evictWorkoutStateCache({
        userId,
        sessionKey: session.session_key,
        workoutSessionId: session.workout_session_id
      });
      await deleteWorkoutSessionRow(session.workout_session_id);
    }

    throw error;
  }
}

/**
 * Updates Workout exercise row with the latest state.
 */
async function updateWorkoutExerciseRow(workoutExerciseId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_exercises')
    .update(patch)
    .eq('workout_exercise_id', workoutExerciseId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Updates Workout set row with the latest state.
 */
async function updateWorkoutSetRow(workoutSetId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_sets')
    .update(patch)
    .eq('workout_set_id', workoutSetId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Updates Workout session row with the latest state.
 */
async function updateWorkoutSessionRow(workoutSessionId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_sessions')
    .update(patch)
    .eq('workout_session_id', workoutSessionId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Handles Delete workout session row for workout-state.service.js.
 */
async function deleteWorkoutSessionRow(workoutSessionId) {
  const supabase = getAdminClientOrThrow();
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('workout_session_id', workoutSessionId);

  if (error) {
    throw error;
  }
}

/**
 * Handles Workout session has exercises for workout-state.service.js.
 */
async function workoutSessionHasExercises(workoutSessionId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('workout_exercise_id')
    .eq('workout_session_id', workoutSessionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data && data.workout_exercise_id);
}

/**
 * Handles Insert workout adjustment rows for workout-state.service.js.
 */
async function insertWorkoutAdjustmentRows(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('workout_adjustments')
    .insert(rows)
    .select('*');

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Handles Delete workout sets by exercise ID for workout-state.service.js.
 */
async function deleteWorkoutSetsByExerciseId(workoutExerciseId) {
  const supabase = getAdminClientOrThrow();
  const { error } = await supabase
    .from('workout_sets')
    .delete()
    .eq('workout_exercise_id', workoutExerciseId);

  if (error) {
    throw error;
  }
}

/**
 * Handles Insert draft exercises and sets for workout-state.service.js.
 */
async function insertDraftExercisesAndSets({
  workoutSessionId,
  drafts,
  activeExerciseIndex,
  activeSetIndex,
  phase,
  timestamp
}) {
  const supabase = getAdminClientOrThrow();
  const exerciseRows = drafts.map(draft => ({
    workout_session_id: workoutSessionId,
    exercise_id: resolveExerciseDefinitionId(draft.exerciseId),
    exercise_key: buildExerciseKey(draft),
    exercise_name_raw: draft.exerciseName,
    exercise_name_normalized: normalizeExerciseName(draft.exerciseName),
    order_index: draft.orderIndex,
    status: draft.orderIndex === activeExerciseIndex && phase !== 'finished' ? 'active' : 'pending',
    prescription_json: buildExercisePrescriptionPayload(draft),
    coach_message: draft.coachMessage || null,
    started_at: draft.orderIndex === activeExerciseIndex && phase !== 'finished' ? timestamp : null,
    completed_at: null
  }));

  const { data: insertedExercises, error: exercisesError } = await supabase
    .from('workout_exercises')
    .insert(exerciseRows)
    .select('*');

  if (exercisesError) {
    throw exercisesError;
  }

  const exerciseIdByOrderIndex = new Map(
    (insertedExercises || []).map(row => [row.order_index, row.workout_exercise_id])
  );

  const setRows = drafts.flatMap(draft => {
    const workoutExerciseId = exerciseIdByOrderIndex.get(draft.orderIndex);
    const isActiveExercise = draft.orderIndex === activeExerciseIndex && phase !== 'finished';

    return (draft.sets || []).map(draftSet => buildSetInsertRow({
      workoutExerciseId,
      draftSet,
      status: isActiveExercise && phase === 'exercise' && draftSet.setIndex === activeSetIndex
        ? 'active'
        : 'pending',
      startedAt: timestamp
    }));
  });

  if (setRows.length > 0) {
    const { error: setsError } = await supabase
      .from('workout_sets')
      .insert(setRows);

    if (setsError) {
      throw setsError;
    }
  }

  return insertedExercises || [];
}

/**
 * Handles Combine notes for workout-state.service.js.
 */
function combineNotes(existingNotes, userNote) {
  const notes = [existingNotes, userNote]
    .map(value => (value ? String(value).trim() : ''))
    .filter(Boolean);

  return notes.length > 0 ? notes.join('\n') : null;
}

/**
 * Resolves Exercise terminal status before the next step runs.
 */
function resolveExerciseTerminalStatus(setRows) {
  if (setRows.length === 0) {
    return 'pending';
  }

  if (setRows.every(row => row.status === 'skipped')) {
    return 'skipped';
  }

  if (setRows.every(row => TERMINAL_SET_STATUSES.has(row.status))) {
    return 'completed';
  }

  if (setRows.some(row => row.status === 'active')) {
    return 'active';
  }

  if (setRows.some(row => TERMINAL_SET_STATUSES.has(row.status))) {
    return 'active';
  }

  return 'pending';
}

/**
 * Handles Find first pending set index for workout-state.service.js.
 */
function findFirstPendingSetIndex(setRows) {
  const nextSet = setRows
    .filter(row => !TERMINAL_SET_STATUSES.has(row.status))
    .sort((left, right) => left.set_index - right.set_index)[0];

  return nextSet ? nextSet.set_index : null;
}

/**
 * Resolves Automatic flow before the next step runs.
 */
function resolveAutomaticFlow({ session, exercises, sets, currentExerciseOrderIndex }) {
  const currentExercise = exercises.find(entry => entry.order_index === currentExerciseOrderIndex) || null;
  const currentExerciseSets = sets
    .filter(entry => currentExercise && entry.workout_exercise_id === currentExercise.workout_exercise_id)
    .sort((left, right) => left.set_index - right.set_index);

  const nextSetIndex = findFirstPendingSetIndex(currentExerciseSets);
  if (currentExercise && nextSetIndex != null) {
    return {
      currentPhase: 'exercise',
      currentExerciseIndex: currentExercise.order_index,
      currentSetIndex: nextSetIndex,
      sessionStatus: 'in_progress'
    };
  }

  const nextExercise = exercises
    .filter(entry => entry.order_index > currentExerciseOrderIndex)
    .sort((left, right) => left.order_index - right.order_index)
    .find(entry => !TERMINAL_EXERCISE_STATUSES.has(entry.status));

  if (nextExercise) {
    const nextExerciseSets = sets
      .filter(entry => entry.workout_exercise_id === nextExercise.workout_exercise_id)
      .sort((left, right) => left.set_index - right.set_index);
    const firstPendingSetIndex = findFirstPendingSetIndex(nextExerciseSets);

    return {
      currentPhase: 'exercise',
      currentExerciseIndex: nextExercise.order_index,
      currentSetIndex: firstPendingSetIndex != null ? firstPendingSetIndex : 0,
      sessionStatus: 'in_progress'
    };
  }

  return {
    currentPhase: 'finished',
    currentExerciseIndex: currentExercise ? currentExercise.order_index : session.current_exercise_index,
    currentSetIndex: null,
    sessionStatus: 'completed'
  };
}

/**
 * Resolves Flow directive before the next step runs.
 */
function resolveFlowDirective({ input, session, exercises, sets, currentExerciseOrderIndex }) {
  const flow = input.flow || {};
  const hasExplicitFlow = (
    flow.currentPhase != null ||
    flow.currentExerciseIndex != null ||
    flow.currentSetIndex != null
  );

  if (!hasExplicitFlow) {
    return resolveAutomaticFlow({
      session,
      exercises,
      sets,
      currentExerciseOrderIndex
    });
  }

  const currentExerciseIndex = flow.currentExerciseIndex != null
    ? flow.currentExerciseIndex
    : session.current_exercise_index;
  const selectedExercise = exercises.find(entry => entry.order_index === currentExerciseIndex);

  if (!selectedExercise) {
    throw buildError('INVALID_FLOW_DIRECTIVE', {
      reason: 'currentExerciseIndex does not exist in this workout.',
      currentExerciseIndex
    });
  }

  const selectedSetRows = sets.filter(entry => entry.workout_exercise_id === selectedExercise.workout_exercise_id);
  if (flow.currentSetIndex != null && !selectedSetRows.some(entry => entry.set_index === flow.currentSetIndex)) {
    throw buildError('INVALID_FLOW_DIRECTIVE', {
      reason: 'currentSetIndex does not exist on the selected exercise.',
      currentExerciseIndex,
      currentSetIndex: flow.currentSetIndex
    });
  }

  return {
    currentPhase: flow.currentPhase || session.current_phase || 'exercise',
    currentExerciseIndex,
    currentSetIndex: flow.currentSetIndex != null ? flow.currentSetIndex : session.current_set_index,
    sessionStatus: flow.currentPhase === 'finished' ? 'completed' : 'in_progress'
  };
}

/**
 * Marks Future node active if needed with the appropriate status.
 */
async function markFutureNodeActiveIfNeeded({ flow, exercises, sets, timestamp }) {
  if (flow.currentPhase === 'finished' || flow.currentExerciseIndex == null) {
    return;
  }

  const targetExercise = exercises.find(entry => entry.order_index === flow.currentExerciseIndex);

  if (!targetExercise) {
    return;
  }

  if (!TERMINAL_EXERCISE_STATUSES.has(targetExercise.status) && targetExercise.status !== 'active') {
    await updateWorkoutExerciseRow(targetExercise.workout_exercise_id, {
      status: 'active',
      started_at: targetExercise.started_at || timestamp
    });
  }

  if (flow.currentPhase === 'exercise' && flow.currentSetIndex != null) {
    const targetSet = sets.find(entry => (
      entry.workout_exercise_id === targetExercise.workout_exercise_id &&
      entry.set_index === flow.currentSetIndex
    ));

    if (targetSet && targetSet.status === 'pending') {
      await updateWorkoutSetRow(targetSet.workout_set_id, {
        status: 'active',
        started_at: targetSet.started_at || timestamp
      });
    }
  }
}

/**
 * Records Workout set result for later use.
 */
async function recordWorkoutSetResult({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  const { session, exercises } = graph;
  assertExpectedStateVersion(session, input.expectedStateVersion);

  if (!LIVE_WORKOUT_STATUSES.includes(session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: session.workout_session_id,
      status: session.status
    });
  }

  const exercise = findWorkoutExerciseRow(graph, input.workoutExerciseId);
  if (!exercise) {
    throw buildError('EXERCISE_NOT_FOUND', {
      workoutExerciseId: input.workoutExerciseId
    });
  }

  const setRows = graph.sets
    .filter(row => row.workout_exercise_id === exercise.workout_exercise_id)
    .sort((left, right) => left.set_index - right.set_index);
  const targetSet = setRows.find(row => row.set_index === input.setIndex);

  if (!targetSet) {
    throw buildError('SET_NOT_FOUND', {
      workoutExerciseId: input.workoutExerciseId,
      setIndex: input.setIndex
    });
  }

  if (TERMINAL_SET_STATUSES.has(targetSet.status)) {
    throw buildError('SET_ALREADY_RECORDED', {
      workoutExerciseId: input.workoutExerciseId,
      setIndex: input.setIndex,
      currentStatus: targetSet.status
    });
  }

  const completedAt = new Date().toISOString();
  const updatedTargetSet = await updateWorkoutSetRow(targetSet.workout_set_id, {
    status: input.resultStatus,
    actual_reps: Number.isInteger(input.actual && input.actual.reps) ? input.actual.reps : null,
    actual_load: input.actual && input.actual.load && typeof input.actual.load.value === 'number'
      ? input.actual.load.value
      : null,
    actual_duration_sec: Number.isInteger(input.actual && input.actual.durationSec)
      ? input.actual.durationSec
      : null,
    actual_distance_m: Number.isInteger(input.actual && input.actual.distanceM)
      ? input.actual.distanceM
      : null,
    actual_rpe: typeof (input.actual && input.actual.rpe) === 'number'
      ? input.actual.rpe
      : null,
    notes: combineNotes(targetSet.notes, input.userNote),
    started_at: targetSet.started_at || completedAt,
    completed_at: completedAt
  });

  const refreshedGraph = await loadWorkoutGraph({
    userId,
    workoutSessionId: session.workout_session_id
  });

  const refreshedSetRows = refreshedGraph.sets
    .filter(row => row.workout_exercise_id === exercise.workout_exercise_id)
    .sort((left, right) => left.set_index - right.set_index);
  const nextExerciseStatus = resolveExerciseTerminalStatus(refreshedSetRows);

  await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
    status: nextExerciseStatus,
    started_at: exercise.started_at || targetSet.started_at || completedAt,
    completed_at: TERMINAL_EXERCISE_STATUSES.has(nextExerciseStatus) ? completedAt : null
  });

  const graphAfterExerciseUpdate = await loadWorkoutGraph({
    userId,
    workoutSessionId: session.workout_session_id
  });
  const flow = resolveFlowDirective({
    input,
    session: graphAfterExerciseUpdate.session,
    exercises: graphAfterExerciseUpdate.exercises,
    sets: graphAfterExerciseUpdate.sets,
    currentExerciseOrderIndex: exercise.order_index
  });

  const summaryJson = {
    ...(graphAfterExerciseUpdate.session.summary_json || {}),
    lastDecision: input.decision || null,
    liveFlow: {
      currentPhase: flow.currentPhase,
      currentExerciseIndex: flow.currentExerciseIndex,
      currentSetIndex: flow.currentSetIndex,
      startRestSec: input.flow && input.flow.startRestSec != null ? input.flow.startRestSec : null
    }
  };

  await updateWorkoutSessionRow(graphAfterExerciseUpdate.session.workout_session_id, {
    state_version: buildNextStateVersion(graphAfterExerciseUpdate.session),
    status: flow.sessionStatus,
    current_phase: flow.currentPhase,
    current_exercise_index: flow.currentExerciseIndex,
    current_set_index: flow.currentSetIndex,
    summary_json: summaryJson,
    completed_at: flow.sessionStatus === 'completed' ? completedAt : null
  });

  await markFutureNodeActiveIfNeeded({
    flow,
    exercises: graphAfterExerciseUpdate.exercises,
    sets: graphAfterExerciseUpdate.sets,
    timestamp: completedAt
  });

  const finalState = await getCurrentWorkoutState({
    userId,
    workoutSessionId: graphAfterExerciseUpdate.session.workout_session_id,
    bypassCache: true
  });

  return {
    updatedSet: updatedTargetSet,
    workout: finalState
  };
}

/**
 * Handles Has explicit flow for workout-state.service.js.
 */
function hasExplicitFlow(flow) {
  return Boolean(flow) && (
    flow.currentPhase != null ||
    flow.currentExerciseIndex != null ||
    flow.currentSetIndex != null
  );
}

/**
 * Normalizes Draft order indexes into the format this file expects.
 */
function normalizeDraftOrderIndexes(drafts, startingOrderIndex) {
  return [...drafts]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((draft, offset) => ({
      ...draft,
      orderIndex: startingOrderIndex + offset
    }));
}

/**
 * Infers Adjustment type from target from the available inputs.
 */
function inferAdjustmentTypeFromTarget(target) {
  if (!target || typeof target !== 'object') {
    return 'note';
  }

  if (target.load || target.loadPrescription) {
    return 'adjust_load';
  }

  if (target.reps != null || target.repRange) {
    return 'adjust_reps';
  }

  if (target.durationSec != null || target.distanceM != null) {
    return 'adjust_duration';
  }

  return 'note';
}

/**
 * Handles Rewrite remaining workout from draft for workout-state.service.js.
 */
async function rewriteRemainingWorkoutFromDraft({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const timestamp = new Date().toISOString();
  const unfinishedExercises = graph.exercises
    .filter(exercise => !TERMINAL_EXERCISE_STATUSES.has(exercise.status))
    .sort((left, right) => left.order_index - right.order_index);

  if (unfinishedExercises.length === 0) {
    throw buildError('NO_REMAINING_WORKOUT_TO_REWRITE', {
      workoutSessionId: input.workoutSessionId
    });
  }

  const firstReplacementOrderIndex = unfinishedExercises[0].order_index;
  const adjustments = [];

  for (const exercise of unfinishedExercises) {
    const exerciseSets = graph.sets.filter(row => row.workout_exercise_id === exercise.workout_exercise_id);

    for (const setRow of exerciseSets) {
      if (!TERMINAL_SET_STATUSES.has(setRow.status)) {
        await updateWorkoutSetRow(setRow.workout_set_id, {
          status: 'skipped',
          completed_at: timestamp
        });
      }
    }

    await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
      status: 'canceled',
      completed_at: timestamp
    });

    adjustments.push({
      workout_exercise_id: exercise.workout_exercise_id,
      set_index: null,
      adjustment_type: 'note',
      source: 'agent',
      reason: input.decision.rationale,
      before_json: {
        exerciseName: exercise.exercise_name_raw,
        orderIndex: exercise.order_index,
        status: exercise.status
      },
      after_json: {
        status: 'canceled',
        rewritten: true
      }
    });
  }

  const normalizedDrafts = normalizeDraftOrderIndexes(
    input.remainingExercises,
    firstReplacementOrderIndex
  );
  const flow = hasExplicitFlow(input.flow)
    ? {
        currentPhase: input.flow.currentPhase || 'exercise',
        currentExerciseIndex: input.flow.currentExerciseIndex != null
          ? input.flow.currentExerciseIndex
          : normalizedDrafts[0].orderIndex,
        currentSetIndex: input.flow.currentSetIndex != null
          ? input.flow.currentSetIndex
          : normalizedDrafts[0].sets[0].setIndex
      }
    : {
        currentPhase: 'exercise',
        currentExerciseIndex: normalizedDrafts[0].orderIndex,
        currentSetIndex: normalizedDrafts[0].sets[0].setIndex
      };

  await insertDraftExercisesAndSets({
    workoutSessionId: graph.session.workout_session_id,
    drafts: normalizedDrafts,
    activeExerciseIndex: flow.currentExerciseIndex,
    activeSetIndex: flow.currentSetIndex,
    phase: flow.currentPhase,
    timestamp
  });

  await insertWorkoutAdjustmentRows(adjustments);

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: flow.currentPhase === 'preview' ? 'queued' : 'in_progress',
    current_phase: flow.currentPhase,
    current_exercise_index: flow.currentExerciseIndex,
    current_set_index: flow.currentSetIndex,
    title: input.title || graph.session.title,
    guidance_json: {
      ...(graph.session.guidance_json || {}),
      ...(input.guidance || {}),
      lastDecision: input.decision
    },
    summary_json: {
      ...(graph.session.summary_json || {}),
      lastDecision: input.decision
    },
    completed_at: null
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Replaces Workout exercise from draft with updated content.
 */
async function replaceWorkoutExerciseFromDraft({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const exercise = findWorkoutExerciseRow(graph, input.workoutExerciseId);
  if (!exercise) {
    throw buildError('EXERCISE_NOT_FOUND', {
      workoutExerciseId: input.workoutExerciseId
    });
  }

  if (TERMINAL_EXERCISE_STATUSES.has(exercise.status)) {
    throw buildError('EXERCISE_ALREADY_TERMINAL', {
      workoutExerciseId: input.workoutExerciseId,
      status: exercise.status
    });
  }

  const exerciseSets = graph.sets.filter(row => row.workout_exercise_id === exercise.workout_exercise_id);
  if (exerciseSets.some(row => TERMINAL_SET_STATUSES.has(row.status))) {
    throw buildError('EXERCISE_ALREADY_STARTED', {
      workoutExerciseId: input.workoutExerciseId,
      reason: 'Completed or skipped set history already exists on this exercise. Use workout_rewrite_remaining instead.'
    });
  }

  const timestamp = new Date().toISOString();
  const flow = hasExplicitFlow(input.flow)
    ? {
        currentPhase: input.flow.currentPhase || graph.session.current_phase || 'exercise',
        currentExerciseIndex: input.flow.currentExerciseIndex != null
          ? input.flow.currentExerciseIndex
          : exercise.order_index,
        currentSetIndex: input.flow.currentSetIndex != null
          ? input.flow.currentSetIndex
          : input.replacement.sets[0].setIndex
      }
    : {
        currentPhase: graph.session.current_phase === 'preview' ? 'preview' : 'exercise',
        currentExerciseIndex: graph.session.current_exercise_index === exercise.order_index
          ? exercise.order_index
          : graph.session.current_exercise_index,
        currentSetIndex: graph.session.current_exercise_index === exercise.order_index
          ? input.replacement.sets[0].setIndex
          : graph.session.current_set_index
      };

  const beforeJson = {
    exerciseName: exercise.exercise_name_raw,
    exerciseKey: exercise.exercise_key,
    orderIndex: exercise.order_index
  };

  await deleteWorkoutSetsByExerciseId(exercise.workout_exercise_id);

  const replacementDraft = {
    ...input.replacement,
    orderIndex: exercise.order_index
  };
  const shouldActivateExercise = flow.currentExerciseIndex === exercise.order_index && flow.currentPhase !== 'finished';

  await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
    exercise_id: resolveExerciseDefinitionId(replacementDraft.exerciseId),
    exercise_key: buildExerciseKey(replacementDraft),
    exercise_name_raw: replacementDraft.exerciseName,
    exercise_name_normalized: normalizeExerciseName(replacementDraft.exerciseName),
    status: shouldActivateExercise ? 'active' : 'pending',
    prescription_json: buildExercisePrescriptionPayload(replacementDraft),
    coach_message: replacementDraft.coachMessage || null,
    started_at: shouldActivateExercise ? (exercise.started_at || timestamp) : null,
    completed_at: null
  });

  const setRows = replacementDraft.sets.map(draftSet => buildSetInsertRow({
    workoutExerciseId: exercise.workout_exercise_id,
    draftSet,
    status: shouldActivateExercise && flow.currentPhase === 'exercise' && draftSet.setIndex === flow.currentSetIndex
      ? 'active'
      : 'pending',
    startedAt: timestamp
  }));

  if (setRows.length > 0) {
    const supabase = getAdminClientOrThrow();
    const { error: setInsertError } = await supabase
      .from('workout_sets')
      .insert(setRows);

    if (setInsertError) {
      throw setInsertError;
    }
  }

  await insertWorkoutAdjustmentRows([
    {
      workout_exercise_id: exercise.workout_exercise_id,
      set_index: null,
      adjustment_type: 'swap_exercise',
      source: 'agent',
      reason: input.decision.rationale,
      before_json: beforeJson,
      after_json: {
        exerciseName: replacementDraft.exerciseName,
        exerciseKey: buildExerciseKey(replacementDraft),
        orderIndex: exercise.order_index
      }
    }
  ]);

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    current_phase: flow.currentPhase,
    current_exercise_index: flow.currentExerciseIndex,
    current_set_index: flow.currentSetIndex,
    completed_at: null
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Handles Adjust workout set targets for workout-state.service.js.
 */
async function adjustWorkoutSetTargets({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const exercise = findWorkoutExerciseRow(graph, input.workoutExerciseId);
  if (!exercise) {
    throw buildError('EXERCISE_NOT_FOUND', {
      workoutExerciseId: input.workoutExerciseId
    });
  }

  const currentState = buildWorkoutState(graph);
  const exerciseState = currentState.exercises.find(entry => entry.workoutExerciseId === input.workoutExerciseId);
  const authoredSets = new Map(
    (((exercise.prescription_json || {}).authoredSets || [])).map(set => [set.setIndex, set])
  );
  const adjustmentRows = [];

  for (const update of input.setUpdates) {
    const setRow = graph.sets.find(row => (
      row.workout_exercise_id === exercise.workout_exercise_id &&
      row.set_index === update.setIndex
    ));

    if (!setRow) {
      throw buildError('SET_NOT_FOUND', {
        workoutExerciseId: input.workoutExerciseId,
        setIndex: update.setIndex
      });
    }

    if (TERMINAL_SET_STATUSES.has(setRow.status)) {
      throw buildError('SET_ALREADY_RECORDED', {
        workoutExerciseId: input.workoutExerciseId,
        setIndex: update.setIndex,
        currentStatus: setRow.status
      });
    }

    const existingSetState = exerciseState
      ? exerciseState.sets.find(set => set.setIndex === update.setIndex)
      : null;

    await updateWorkoutSetRow(setRow.workout_set_id, {
      prescribed_reps: Number.isInteger(update.target.reps) ? update.target.reps : null,
      prescribed_load: buildPrescribedLoad(update.target || {}),
      prescribed_duration_sec: Number.isInteger(update.target.durationSec) ? update.target.durationSec : null,
      prescribed_distance_m: Number.isInteger(update.target.distanceM) ? update.target.distanceM : null,
      prescribed_rpe: typeof update.target.rpe === 'number' ? update.target.rpe : null,
      notes: combineNotes(setRow.notes, update.note)
    });

    authoredSets.set(update.setIndex, {
      setIndex: update.setIndex,
      target: update.target,
      notes: update.note || null
    });

    adjustmentRows.push({
      workout_exercise_id: exercise.workout_exercise_id,
      set_index: update.setIndex,
      adjustment_type: inferAdjustmentTypeFromTarget(update.target),
      source: 'agent',
      reason: input.decision.rationale,
      before_json: existingSetState ? existingSetState.target : null,
      after_json: update.target
    });
  }

  await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
    prescription_json: {
      ...(exercise.prescription_json || {}),
      authoredSets: [...authoredSets.values()].sort((left, right) => left.setIndex - right.setIndex)
    }
  });

  if (adjustmentRows.length > 0) {
    await insertWorkoutAdjustmentRows(adjustmentRows);
  }

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    current_phase: input.flow.currentPhase || graph.session.current_phase,
    current_exercise_index: input.flow.currentExerciseIndex != null
      ? input.flow.currentExerciseIndex
      : graph.session.current_exercise_index,
    current_set_index: input.flow.currentSetIndex != null
      ? input.flow.currentSetIndex
      : graph.session.current_set_index
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Finishes Workout session and closes out the workflow.
 */
async function finishWorkoutSession({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  assertExpectedStateVersion(graph.session, input.expectedStateVersion);

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const timestamp = new Date().toISOString();

  for (const setRow of graph.sets) {
    if (!TERMINAL_SET_STATUSES.has(setRow.status)) {
      await updateWorkoutSetRow(setRow.workout_set_id, {
        status: 'skipped',
        completed_at: timestamp
      });
    }
  }

  for (const exercise of graph.exercises) {
    if (!TERMINAL_EXERCISE_STATUSES.has(exercise.status)) {
      await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
        status: 'canceled',
        completed_at: timestamp
      });
    }
  }

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: input.finalStatus,
    current_phase: 'finished',
    current_exercise_index: null,
    current_set_index: null,
    summary_json: {
      ...(graph.session.summary_json || {}),
      ...(input.summary || {}),
      lastDecision: input.decision
    },
    completed_at: timestamp
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Starts Workout session for this module.
 */
async function startWorkoutSession({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  assertExpectedStateVersion(graph.session, input.expectedStateVersion);

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  if (graph.session.status === 'in_progress' && graph.session.current_phase === 'exercise') {
    return getCurrentWorkoutState({
      userId,
      workoutSessionId: graph.session.workout_session_id,
      bypassCache: true
    });
  }

  const timestamp = new Date().toISOString();
  const targetExercise = findFirstLiveExercise(graph);
  const targetSetIndex = targetExercise
    ? findFirstPendingSetIndex(
        graph.sets
          .filter(row => row.workout_exercise_id === targetExercise.workout_exercise_id)
          .sort((left, right) => left.set_index - right.set_index)
      )
    : null;

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: 'in_progress',
    current_phase: 'exercise',
    current_exercise_index: targetExercise ? targetExercise.order_index : graph.session.current_exercise_index,
    current_set_index: targetSetIndex != null ? targetSetIndex : graph.session.current_set_index,
    started_at: graph.session.started_at || timestamp,
    completed_at: null
  });

  await markFutureNodeActiveIfNeeded({
    flow: {
      currentPhase: 'exercise',
      currentExerciseIndex: targetExercise ? targetExercise.order_index : graph.session.current_exercise_index,
      currentSetIndex: targetSetIndex != null ? targetSetIndex : graph.session.current_set_index,
      sessionStatus: 'in_progress'
    },
    exercises: graph.exercises,
    sets: graph.sets,
    timestamp
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Handles Pause workout session for workout-state.service.js.
 */
async function pauseWorkoutSession({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  assertExpectedStateVersion(graph.session, input.expectedStateVersion);

  if (graph.session.status === 'paused') {
    return getCurrentWorkoutState({
      userId,
      workoutSessionId: graph.session.workout_session_id,
      bypassCache: true
    });
  }

  if (graph.session.status !== 'in_progress') {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: 'paused',
    current_phase: graph.session.current_phase || 'exercise'
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Handles Resume workout session for workout-state.service.js.
 */
async function resumeWorkoutSession({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  assertExpectedStateVersion(graph.session, input.expectedStateVersion);

  if (graph.session.status === 'in_progress') {
    return getCurrentWorkoutState({
      userId,
      workoutSessionId: graph.session.workout_session_id,
      bypassCache: true
    });
  }

  if (graph.session.status !== 'paused') {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const timestamp = new Date().toISOString();
  const currentExercise = findFirstLiveExercise(graph);
  const currentSetIndex = currentExercise
    ? findFirstPendingSetIndex(
        graph.sets
          .filter(row => row.workout_exercise_id === currentExercise.workout_exercise_id)
          .sort((left, right) => left.set_index - right.set_index)
      )
    : graph.session.current_set_index;

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: 'in_progress',
    current_phase: graph.session.current_phase === 'finished' ? 'exercise' : (graph.session.current_phase || 'exercise'),
    current_exercise_index: currentExercise ? currentExercise.order_index : graph.session.current_exercise_index,
    current_set_index: currentSetIndex
  });

  await markFutureNodeActiveIfNeeded({
    flow: {
      currentPhase: graph.session.current_phase === 'finished' ? 'exercise' : (graph.session.current_phase || 'exercise'),
      currentExerciseIndex: currentExercise ? currentExercise.order_index : graph.session.current_exercise_index,
      currentSetIndex,
      sessionStatus: 'in_progress'
    },
    exercises: graph.exercises,
    sets: graph.sets,
    timestamp
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

/**
 * Handles Skip workout exercise for workout-state.service.js.
 */
async function skipWorkoutExercise({ userId, input }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    workoutSessionId: input.workoutSessionId
  });

  if (!graph) {
    throw buildError('WORKOUT_NOT_FOUND', {
      workoutSessionId: input.workoutSessionId
    });
  }

  assertExpectedStateVersion(graph.session, input.expectedStateVersion);

  if (!LIVE_WORKOUT_STATUSES.includes(graph.session.status)) {
    throw buildError('WORKOUT_NOT_ACTIVE', {
      workoutSessionId: graph.session.workout_session_id,
      status: graph.session.status
    });
  }

  const exercise = findWorkoutExerciseRow(graph, input.workoutExerciseId || 'current');
  if (!exercise) {
    throw buildError('EXERCISE_NOT_FOUND', {
      workoutExerciseId: input.workoutExerciseId || 'current'
    });
  }

  if (TERMINAL_EXERCISE_STATUSES.has(exercise.status)) {
    throw buildError('EXERCISE_ALREADY_TERMINAL', {
      workoutExerciseId: exercise.workout_exercise_id,
      status: exercise.status
    });
  }

  const timestamp = new Date().toISOString();
  const exerciseSets = graph.sets
    .filter(row => row.workout_exercise_id === exercise.workout_exercise_id)
    .sort((left, right) => left.set_index - right.set_index);

  for (const setRow of exerciseSets) {
    if (!TERMINAL_SET_STATUSES.has(setRow.status)) {
      await updateWorkoutSetRow(setRow.workout_set_id, {
        status: 'skipped',
        completed_at: timestamp,
        started_at: setRow.started_at || timestamp
      });
    }
  }

  await updateWorkoutExerciseRow(exercise.workout_exercise_id, {
    status: 'skipped',
    started_at: exercise.started_at || timestamp,
    completed_at: timestamp
  });

  const refreshedGraph = await loadWorkoutGraph({
    userId,
    workoutSessionId: graph.session.workout_session_id
  });
  const flow = resolveAutomaticFlow({
    session: refreshedGraph.session,
    exercises: refreshedGraph.exercises,
    sets: refreshedGraph.sets,
    currentExerciseOrderIndex: exercise.order_index
  });

  await updateWorkoutSessionRow(graph.session.workout_session_id, {
    state_version: buildNextStateVersion(graph.session),
    status: flow.sessionStatus,
    current_phase: flow.currentPhase,
    current_exercise_index: flow.currentExerciseIndex,
    current_set_index: flow.currentSetIndex,
    completed_at: flow.sessionStatus === 'completed' ? timestamp : null
  });

  await markFutureNodeActiveIfNeeded({
    flow,
    exercises: refreshedGraph.exercises,
    sets: refreshedGraph.sets,
    timestamp
  });

  return getCurrentWorkoutState({
    userId,
    workoutSessionId: graph.session.workout_session_id,
    bypassCache: true
  });
}

module.exports = {
  __testUtils: {
    buildUtcRangeForDateKeys,
    buildExerciseKey,
    buildNextStateVersion,
    coerceStateVersion,
    findWorkoutExerciseRow,
    findWorkoutSetRow,
    getWorkoutSessionLastTouchedAt,
    getWorkoutHistoryReferenceTimestamp,
    isWorkoutSessionExpired,
    isCurrentReference,
    normalizeWorkoutHistoryWindow,
    resolveExerciseDefinitionId
  },
  LIVE_WORKOUT_STATUSES,
  adjustWorkoutSetTargets,
  createWorkoutSessionFromDraft,
  finishWorkoutSession,
  getCurrentWorkoutState,
  getWorkoutHistory,
  pauseWorkoutSession,
  recordWorkoutSetResult,
  resumeWorkoutSession,
  replaceWorkoutExerciseFromDraft,
  rewriteRemainingWorkoutFromDraft,
  skipWorkoutExercise,
  startWorkoutSession
};
