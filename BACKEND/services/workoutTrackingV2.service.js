const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { z } = require('zod');
const { v4: uuidv4, validate: isUuid } = require('uuid');
const workoutGenerationService = require('./workoutGeneration.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const CURRENT_PAYLOAD_SCHEMA_VERSION = 1;

const exerciseStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
const exerciseTypeSchema = z.enum(['reps', 'hold', 'duration', 'intervals']);

const maybeNonNegativeInt = z.number().int().nonnegative().nullable().optional();
const maybeNonNegativeNumber = z.number().nonnegative().nullable().optional();
const maybeString = z.string().nullable().optional();

const prescriptionSetSchema = z.object({
  target_reps: maybeNonNegativeInt,
  target_load: maybeNonNegativeNumber,
  load_unit: maybeString,
  target_duration_sec: maybeNonNegativeInt,
  target_distance_km: maybeNonNegativeNumber
}).strict();

const performanceSetSchema = z.object({
  actual_reps: maybeNonNegativeInt,
  actual_load: maybeNonNegativeNumber,
  load_unit: maybeString,
  actual_duration_sec: maybeNonNegativeInt,
  actual_distance_km: maybeNonNegativeNumber,
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  completed_at: maybeString
}).strict();

const exercisePayloadSchema = z.object({
  schema_version: z.number().int().min(1),
  identity: z.object({
    name: z.string().min(1),
    type: exerciseTypeSchema
  }).strict(),
  prescription: z.object({
    sets: z.array(prescriptionSetSchema).min(1),
    rest_seconds: z.number().int().nonnegative().nullable().optional()
  }).strict(),
  performance: z.object({
    sets: z.array(performanceSetSchema).min(1),
    exercise_rpe: z.number().int().min(1).max(10).nullable().optional(),
    notes: maybeString
  }).strict(),
  flags: z.object({
    pain: z.boolean().default(false),
    modified: z.boolean().default(false),
    skip_reason: maybeString
  }).strict()
}).strict();

const completeSetCommandSchema = z.object({
  type: z.literal('complete_set'),
  set_index: z.number().int().nonnegative(),
  actual_reps: maybeNonNegativeInt,
  actual_load: maybeNonNegativeNumber,
  load_unit: maybeString,
  actual_duration_sec: maybeNonNegativeInt,
  actual_distance_km: maybeNonNegativeNumber,
  rpe: z.number().int().min(1).max(10).nullable().optional()
}).strict();

const updateSetTargetCommandSchema = z.object({
  type: z.literal('update_set_target'),
  set_index: z.number().int().nonnegative(),
  target_reps: maybeNonNegativeInt,
  target_load: maybeNonNegativeNumber,
  load_unit: maybeString,
  target_duration_sec: maybeNonNegativeInt,
  target_distance_km: maybeNonNegativeNumber
}).strict();

const updateSetActualCommandSchema = z.object({
  type: z.literal('update_set_actual'),
  set_index: z.number().int().nonnegative(),
  actual_reps: maybeNonNegativeInt,
  actual_load: maybeNonNegativeNumber,
  load_unit: maybeString,
  actual_duration_sec: maybeNonNegativeInt,
  actual_distance_km: maybeNonNegativeNumber,
  rpe: z.number().int().min(1).max(10).nullable().optional()
}).strict();

const setExerciseRpeCommandSchema = z.object({
  type: z.literal('set_exercise_rpe'),
  rpe: z.number().int().min(1).max(10).nullable().optional()
}).strict();

const setExerciseNoteCommandSchema = z.object({
  type: z.literal('set_exercise_note'),
  notes: z.string().max(2000).nullable().optional()
}).strict();

const skipExerciseCommandSchema = z.object({
  type: z.literal('skip_exercise'),
  reason: z.string().max(200).optional()
}).strict();

const unskipExerciseCommandSchema = z.object({
  type: z.literal('unskip_exercise')
}).strict();

const completeExerciseCommandSchema = z.object({
  type: z.literal('complete_exercise')
}).strict();

const reopenExerciseCommandSchema = z.object({
  type: z.literal('reopen_exercise')
}).strict();

const adjustRestSecondsCommandSchema = z.object({
  type: z.literal('adjust_rest_seconds'),
  rest_seconds: z.number().int().nonnegative().nullable().optional()
}).strict();

const commandSchema = z.discriminatedUnion('type', [
  completeSetCommandSchema,
  updateSetTargetCommandSchema,
  updateSetActualCommandSchema,
  setExerciseRpeCommandSchema,
  setExerciseNoteCommandSchema,
  skipExerciseCommandSchema,
  unskipExerciseCommandSchema,
  completeExerciseCommandSchema,
  reopenExerciseCommandSchema,
  adjustRestSecondsCommandSchema
]);

const createSessionRequestSchema = z.object({
  intent: z.string().optional(),
  request_text: z.string().nullable().optional(),
  time_available_min: z.number().int().min(5).max(240).nullable().optional(),
  equipment: z.array(z.string()).optional(),
  coach_mode: z.enum(['quiet', 'ringer']).optional(),
  planned_session: z.record(z.string(), z.any()).nullable().optional(),
  planned_intent_original: z.record(z.string(), z.any()).nullable().optional(),
  planned_intent_edited: z.record(z.string(), z.any()).nullable().optional(),
  calendar_event_id: z.string().uuid().nullable().optional(),
  planned_session_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).strict();

function nowIso() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function inferExerciseType(exercise = {}) {
  const rawType = (exercise.exercise_type || exercise.type || '').toLowerCase();
  if (rawType === 'hold') return 'hold';
  if (rawType === 'duration') return 'duration';
  if (rawType === 'intervals') return 'intervals';
  return 'reps';
}

function inferSetCount(exercise = {}, type = inferExerciseType(exercise)) {
  const explicitSets = Number.isFinite(exercise.sets) ? Math.max(1, Math.round(exercise.sets)) : null;
  if (explicitSets) return explicitSets;

  const repsLength = Array.isArray(exercise.reps) ? exercise.reps.length : 0;
  const loadLength = Array.isArray(exercise.load_each) ? exercise.load_each.length : 0;
  const holdLength = Array.isArray(exercise.hold_duration_sec) ? exercise.hold_duration_sec.length : 0;
  if (type === 'intervals' && Number.isFinite(exercise.rounds)) {
    return Math.max(1, Math.round(exercise.rounds));
  }
  if (type === 'duration') return 1;

  return Math.max(1, repsLength, loadLength, holdLength);
}

function buildInitialPayload(exercise = {}) {
  const type = inferExerciseType(exercise);
  const setCount = inferSetCount(exercise, type);
  const loadUnit = exercise.load_unit || null;
  const prescriptionSets = [];

  for (let i = 0; i < setCount; i++) {
    const base = {
      target_reps: null,
      target_load: null,
      load_unit: loadUnit,
      target_duration_sec: null,
      target_distance_km: null
    };

    if (type === 'reps') {
      base.target_reps = Array.isArray(exercise.reps) && Number.isFinite(exercise.reps[i])
        ? Math.max(0, Math.round(exercise.reps[i]))
        : null;
      base.target_load = Array.isArray(exercise.load_each)
        ? Number.isFinite(exercise.load_each[i])
          ? Math.max(0, Number(exercise.load_each[i]))
          : (exercise.load_each.length === 1 && Number.isFinite(exercise.load_each[0])
              ? Math.max(0, Number(exercise.load_each[0]))
              : null)
        : null;
    } else if (type === 'hold') {
      base.target_duration_sec = Array.isArray(exercise.hold_duration_sec) && Number.isFinite(exercise.hold_duration_sec[i])
        ? Math.max(0, Math.round(exercise.hold_duration_sec[i]))
        : null;
    } else if (type === 'duration') {
      const mins = Number.isFinite(exercise.duration_min) ? Math.max(0, Math.round(exercise.duration_min)) : null;
      base.target_duration_sec = mins === null ? null : mins * 60;
      base.target_distance_km = Number.isFinite(exercise.distance_km)
        ? Math.max(0, Number(exercise.distance_km))
        : null;
    } else if (type === 'intervals') {
      base.target_duration_sec = Number.isFinite(exercise.work_sec)
        ? Math.max(0, Math.round(exercise.work_sec))
        : null;
    }

    prescriptionSets.push(base);
  }

  const performanceSets = prescriptionSets.map(() => ({
    actual_reps: null,
    actual_load: null,
    load_unit: loadUnit,
    actual_duration_sec: null,
    actual_distance_km: null,
    rpe: null,
    completed_at: null
  }));

  return {
    schema_version: CURRENT_PAYLOAD_SCHEMA_VERSION,
    identity: {
      name: exercise.exercise_name || exercise.name || 'Exercise',
      type
    },
    prescription: {
      sets: prescriptionSets,
      rest_seconds: Number.isFinite(exercise.rest_seconds)
        ? Math.max(0, Math.round(exercise.rest_seconds))
        : null
    },
    performance: {
      sets: performanceSets,
      exercise_rpe: null,
      notes: null
    },
    flags: {
      pain: false,
      modified: false,
      skip_reason: null
    }
  };
}

function migratePayloadToLatest(payload = {}) {
  const version = Number(payload?.schema_version || 1);
  if (version > CURRENT_PAYLOAD_SCHEMA_VERSION) {
    throw new Error(`Unsupported payload schema_version ${version}`);
  }

  if (version === CURRENT_PAYLOAD_SCHEMA_VERSION) {
    return payload;
  }

  const migrated = {
    ...payload,
    schema_version: CURRENT_PAYLOAD_SCHEMA_VERSION
  };

  return migrated;
}

function normalizePayload(payload) {
  const migrated = migratePayloadToLatest(payload);
  return exercisePayloadSchema.parse(migrated);
}

function hasAnySetPerformance(perfSet = {}) {
  return (
    perfSet.actual_reps !== null && perfSet.actual_reps !== undefined
    || perfSet.actual_duration_sec !== null && perfSet.actual_duration_sec !== undefined
    || perfSet.actual_distance_km !== null && perfSet.actual_distance_km !== undefined
    || perfSet.actual_load !== null && perfSet.actual_load !== undefined
  );
}

function deriveExerciseStatus(payload, currentStatus) {
  if (currentStatus === 'skipped') return 'skipped';

  const perfSets = payload.performance?.sets || [];
  const completedCount = perfSets.filter(hasAnySetPerformance).length;
  if (completedCount === 0) return 'pending';
  if (completedCount >= perfSets.length) return 'completed';
  return 'in_progress';
}

function deriveExerciseMetrics(payload) {
  const perfSets = payload.performance?.sets || [];
  let totalReps = 0;
  let volume = 0;
  let durationSec = 0;

  for (const perf of perfSets) {
    const reps = Number.isFinite(perf.actual_reps) ? perf.actual_reps : 0;
    const load = Number.isFinite(perf.actual_load) ? perf.actual_load : 0;
    const duration = Number.isFinite(perf.actual_duration_sec) ? perf.actual_duration_sec : 0;

    totalReps += reps;
    volume += reps * load;
    durationSec += duration;
  }

  const fallbackSetRpes = perfSets
    .map(set => (Number.isFinite(set.rpe) ? set.rpe : null))
    .filter(rpe => rpe !== null);

  const exerciseRpe = Number.isFinite(payload.performance?.exercise_rpe)
    ? payload.performance.exercise_rpe
    : (fallbackSetRpes.length
      ? Math.round(fallbackSetRpes.reduce((sum, value) => sum + value, 0) / fallbackSetRpes.length)
      : null);

  return {
    exercise_name: payload.identity?.name || 'Exercise',
    exercise_rpe: exerciseRpe,
    total_reps: totalReps,
    volume,
    duration_sec: durationSec
  };
}

function ensureSetIndex(payload, setIndex) {
  const length = payload.performance?.sets?.length || 0;
  if (setIndex < 0 || setIndex >= length) {
    throw new Error('set_index out of range');
  }
}

function applyCommandReducer(payload, currentStatus, command) {
  const parsedCommand = commandSchema.parse(command);
  const nextPayload = cloneJson(payload);
  let nextStatus = currentStatus;

  switch (parsedCommand.type) {
    case 'complete_set': {
      ensureSetIndex(nextPayload, parsedCommand.set_index);
      const target = nextPayload.performance.sets[parsedCommand.set_index];
      target.actual_reps = parsedCommand.actual_reps ?? target.actual_reps;
      target.actual_load = parsedCommand.actual_load ?? target.actual_load;
      target.load_unit = parsedCommand.load_unit ?? target.load_unit;
      target.actual_duration_sec = parsedCommand.actual_duration_sec ?? target.actual_duration_sec;
      target.actual_distance_km = parsedCommand.actual_distance_km ?? target.actual_distance_km;
      target.rpe = parsedCommand.rpe ?? target.rpe;
      target.completed_at = nowIso();
      nextStatus = deriveExerciseStatus(nextPayload, currentStatus);
      break;
    }
    case 'update_set_target': {
      ensureSetIndex(nextPayload, parsedCommand.set_index);
      const target = nextPayload.prescription.sets[parsedCommand.set_index];
      target.target_reps = parsedCommand.target_reps ?? target.target_reps;
      target.target_load = parsedCommand.target_load ?? target.target_load;
      target.load_unit = parsedCommand.load_unit ?? target.load_unit;
      target.target_duration_sec = parsedCommand.target_duration_sec ?? target.target_duration_sec;
      target.target_distance_km = parsedCommand.target_distance_km ?? target.target_distance_km;
      nextPayload.flags.modified = true;
      break;
    }
    case 'update_set_actual': {
      ensureSetIndex(nextPayload, parsedCommand.set_index);
      const target = nextPayload.performance.sets[parsedCommand.set_index];
      target.actual_reps = parsedCommand.actual_reps ?? target.actual_reps;
      target.actual_load = parsedCommand.actual_load ?? target.actual_load;
      target.load_unit = parsedCommand.load_unit ?? target.load_unit;
      target.actual_duration_sec = parsedCommand.actual_duration_sec ?? target.actual_duration_sec;
      target.actual_distance_km = parsedCommand.actual_distance_km ?? target.actual_distance_km;
      target.rpe = parsedCommand.rpe ?? target.rpe;
      if (hasAnySetPerformance(target)) {
        target.completed_at = target.completed_at || nowIso();
      }
      nextStatus = deriveExerciseStatus(nextPayload, currentStatus);
      break;
    }
    case 'set_exercise_rpe': {
      nextPayload.performance.exercise_rpe = parsedCommand.rpe ?? null;
      break;
    }
    case 'set_exercise_note': {
      nextPayload.performance.notes = parsedCommand.notes ?? null;
      break;
    }
    case 'skip_exercise': {
      nextPayload.flags.skip_reason = parsedCommand.reason || 'user_skipped';
      nextStatus = 'skipped';
      break;
    }
    case 'unskip_exercise': {
      nextPayload.flags.skip_reason = null;
      nextStatus = deriveExerciseStatus(nextPayload, 'pending');
      break;
    }
    case 'complete_exercise': {
      const timestamp = nowIso();
      for (const perf of nextPayload.performance.sets) {
        if (!perf.completed_at && hasAnySetPerformance(perf)) {
          perf.completed_at = timestamp;
        }
      }
      nextStatus = 'completed';
      break;
    }
    case 'reopen_exercise': {
      nextStatus = deriveExerciseStatus(nextPayload, 'pending');
      break;
    }
    case 'adjust_rest_seconds': {
      nextPayload.prescription.rest_seconds = parsedCommand.rest_seconds ?? null;
      nextPayload.flags.modified = true;
      break;
    }
    default:
      throw new Error(`Unsupported command type: ${parsedCommand.type}`);
  }

  nextPayload.schema_version = CURRENT_PAYLOAD_SCHEMA_VERSION;
  const normalizedPayload = normalizePayload(nextPayload);
  const normalizedStatus = exerciseStatusSchema.parse(nextStatus);
  const metrics = deriveExerciseMetrics(normalizedPayload);

  return {
    payload: normalizedPayload,
    status: normalizedStatus,
    metrics
  };
}

function mapPayloadToUIExercise(exerciseRow) {
  const payload = normalizePayload(exerciseRow.payload_json || {});
  const type = payload.identity.type;
  const sets = payload.prescription.sets || [];

  const reps = sets
    .map(set => (Number.isFinite(set.target_reps) ? set.target_reps : null))
    .filter(value => value !== null);
  const loadEach = sets
    .map(set => (Number.isFinite(set.target_load) ? Number(set.target_load) : null))
    .filter(value => value !== null);
  const holdDurationSec = sets
    .map(set => (Number.isFinite(set.target_duration_sec) ? set.target_duration_sec : null))
    .filter(value => value !== null);

  const firstSet = sets[0] || {};
  const durationFromSet = Number.isFinite(firstSet.target_duration_sec)
    ? Math.round(firstSet.target_duration_sec / 60)
    : null;

  return {
    id: exerciseRow.id,
    exercise_name: payload.identity.name,
    exercise_type: type,
    sets: type === 'duration' ? 1 : sets.length,
    reps: reps.length ? reps : null,
    load_each: loadEach.length ? loadEach : null,
    load_unit: firstSet.load_unit || null,
    hold_duration_sec: type === 'hold' && holdDurationSec.length ? holdDurationSec : null,
    duration_min: type === 'duration' ? durationFromSet : null,
    distance_km: Number.isFinite(firstSet.target_distance_km) ? Number(firstSet.target_distance_km) : null,
    distance_unit: null,
    rounds: type === 'intervals' ? sets.length : null,
    work_sec: type === 'intervals' && Number.isFinite(firstSet.target_duration_sec) ? firstSet.target_duration_sec : null,
    total_duration_min: type === 'duration' ? durationFromSet : null,
    rest_seconds: payload.prescription.rest_seconds ?? null,
    muscles_utilized: null,
    goals_addressed: null,
    reasoning: null,
    equipment: null,
    exercise_description: null
  };
}

function createSummaryFromExercises(workout, exercises, reflection = {}) {
  const totalExercises = exercises.length;
  const completedExercises = exercises.filter(ex => ex.status === 'completed' || ex.status === 'skipped').length;
  const completedSets = exercises.reduce((sum, ex) => {
    const payload = normalizePayload(ex.payload_json);
    const sets = payload.performance?.sets || [];
    return sum + sets.filter(hasAnySetPerformance).length;
  }, 0);

  const wins = [];
  if (completedExercises > 0) {
    wins.push(`Completed ${completedExercises} of ${totalExercises} exercises.`);
  }
  if (completedSets > 0) {
    wins.push(`Logged ${completedSets} completed sets.`);
  }

  return {
    title: workout?.title || 'Workout complete',
    completion: {
      exercises: completedExercises,
      total_sets: completedSets
    },
    overall_rpe: Number.isFinite(reflection?.rpe) ? reflection.rpe : null,
    pain_notes: reflection?.pain || null,
    wins: wins.length ? wins : ['Workout tracked successfully.'],
    next_session_focus: reflection?.notes || 'Continue progressive training next session.'
  };
}

async function getSessionRow(sessionId) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getWorkoutRow(sessionId) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getExerciseRows(workoutId) {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .order('exercise_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

function formatSessionForClient(sessionRow) {
  if (!sessionRow) return null;
  return {
    id: sessionRow.id,
    user_id: sessionRow.user_id,
    status: sessionRow.status,
    coach_mode: sessionRow.coach_mode || 'quiet',
    started_at: sessionRow.started_at,
    completed_at: sessionRow.completed_at,
    metadata: sessionRow.metadata || {}
  };
}

function formatWorkoutForClient(workoutRow) {
  if (!workoutRow) return null;
  return {
    id: workoutRow.id,
    session_id: workoutRow.session_id,
    title: workoutRow.title,
    workout_type: workoutRow.workout_type,
    planned_duration_min: workoutRow.planned_duration_min,
    actual_duration_min: workoutRow.actual_duration_min,
    created_at: workoutRow.created_at,
    updated_at: workoutRow.updated_at
  };
}

function formatExerciseRowForClient(exerciseRow) {
  return {
    id: exerciseRow.id,
    workout_id: exerciseRow.workout_id,
    exercise_order: exerciseRow.exercise_order,
    exercise_type: exerciseRow.exercise_type,
    status: exerciseRow.status,
    payload_json: exerciseRow.payload_json,
    payload_version: exerciseRow.payload_version,
    exercise_name: exerciseRow.exercise_name,
    exercise_rpe: exerciseRow.exercise_rpe,
    total_reps: exerciseRow.total_reps,
    volume: exerciseRow.volume,
    duration_sec: exerciseRow.duration_sec,
    completed_at: exerciseRow.completed_at,
    created_at: exerciseRow.created_at,
    updated_at: exerciseRow.updated_at
  };
}

function toLegacyInstance(workoutRow, exerciseRows) {
  return {
    title: workoutRow?.title || 'Workout',
    estimated_duration_min: workoutRow?.planned_duration_min || null,
    focus: workoutRow?.workout_type ? [workoutRow.workout_type] : [],
    exercises: exerciseRows.map(mapPayloadToUIExercise),
    metadata: {
      generated_at: nowIso()
    }
  };
}

async function getSessionDetail({ sessionId, userId }) {
  const sessionRow = await getSessionRow(sessionId);
  if (!sessionRow) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    throw error;
  }
  if (sessionRow.user_id !== userId) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }

  const workoutRow = await getWorkoutRow(sessionId);
  const exerciseRows = workoutRow ? await getExerciseRows(workoutRow.id) : [];

  return {
    session: formatSessionForClient(sessionRow),
    workout: formatWorkoutForClient(workoutRow),
    exercises: exerciseRows.map(formatExerciseRowForClient),
    instance: workoutRow ? toLegacyInstance(workoutRow, exerciseRows) : null,
    instance_version: workoutRow ? 1 : null
  };
}

function ensureUuid(value, fallbackFactory = () => uuidv4()) {
  if (typeof value === 'string' && isUuid(value)) return value;
  return fallbackFactory();
}

async function createWorkoutSession({ userId, requestBody = {} }) {
  const parsed = createSessionRequestSchema.parse(requestBody);

  const sessionId = uuidv4();
  const metadata = {
    ...(parsed.metadata || {})
  };
  if (parsed.calendar_event_id) metadata.calendar_event_id = parsed.calendar_event_id;
  if (parsed.planned_session_id) metadata.planned_session_id = parsed.planned_session_id;
  if (parsed.planned_intent_original) metadata.planned_intent_original = parsed.planned_intent_original;
  if (parsed.planned_intent_edited) metadata.planned_intent_edited = parsed.planned_intent_edited;

  const { error: sessionError } = await supabase
    .from('workout_sessions')
    .insert({
      id: sessionId,
      user_id: userId,
      status: 'in_progress',
      coach_mode: parsed.coach_mode || 'quiet',
      started_at: nowIso(),
      metadata
    });
  if (sessionError) throw sessionError;

  const constraints = {
    intent: parsed.intent || 'planned',
    request_text: parsed.request_text || null,
    time_available_min: parsed.time_available_min || null,
    equipment: parsed.equipment || [],
    planned_session: parsed.planned_session || null,
    planned_intent_original: parsed.planned_intent_original || null,
    planned_intent_edited: parsed.planned_intent_edited || null
  };

  try {
    const instance = await workoutGenerationService.generateWorkoutInstance(userId, constraints);

    const { data: workoutRow, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        session_id: sessionId,
        title: instance.title || 'Workout',
        workout_type: instance.focus?.[0] || parsed.intent || null,
        planned_duration_min: Number.isFinite(instance.estimated_duration_min)
          ? Math.round(instance.estimated_duration_min)
          : null
      })
      .select('*')
      .single();
    if (workoutError) throw workoutError;

    const exerciseRows = (instance.exercises || []).map((exercise, index) => {
      const exerciseId = ensureUuid(exercise.id);
      const payload = normalizePayload(buildInitialPayload({ ...exercise, id: exerciseId }));
      const metrics = deriveExerciseMetrics(payload);

      return {
        id: exerciseId,
        workout_id: workoutRow.id,
        exercise_order: index,
        exercise_type: payload.identity.type,
        status: 'pending',
        payload_json: payload,
        payload_version: 1,
        exercise_name: metrics.exercise_name,
        exercise_rpe: metrics.exercise_rpe,
        total_reps: metrics.total_reps,
        volume: metrics.volume,
        duration_sec: metrics.duration_sec
      };
    });

    if (exerciseRows.length) {
      const { error: exerciseInsertError } = await supabase
        .from('workout_exercises')
        .insert(exerciseRows);
      if (exerciseInsertError) throw exerciseInsertError;
    }

    return getSessionDetail({ sessionId, userId });
  } catch (error) {
    await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);
    throw error;
  }
}

async function planWorkoutIntent({ userId, intentText }) {
  const safeIntentText = String(intentText || '').trim();
  if (!safeIntentText) {
    const err = new Error('intent_text is required');
    err.statusCode = 422;
    throw err;
  }
  return workoutGenerationService.generateIntentPlan(userId, safeIntentText);
}

async function getExerciseWithOwnership(exerciseId, userId) {
  const { data: exercise, error: exerciseError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('id', exerciseId)
    .maybeSingle();

  if (exerciseError) throw exerciseError;
  if (!exercise) {
    const notFound = new Error('Exercise not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .select('id, session_id')
    .eq('id', exercise.workout_id)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) {
    const notFound = new Error('Workout not found for exercise');
    notFound.statusCode = 404;
    throw notFound;
  }

  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, user_id, status')
    .eq('id', workout.session_id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.user_id !== userId) {
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    throw forbidden;
  }

  return {
    ...exercise,
    workout: workout,
    session: session
  };
}

async function getActionByCommandId(userId, commandId) {
  const { data, error } = await supabase
    .from('workout_action_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('command_id', commandId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function applyExerciseCommand({
  userId,
  exerciseId,
  commandId,
  expectedVersion,
  command,
  clientMeta = {}
}) {
  const normalizedCommand = commandSchema.parse(command);

  if (!isUuid(commandId)) {
    const err = new Error('command_id must be a valid UUID');
    err.statusCode = 422;
    throw err;
  }
  if (!Number.isFinite(expectedVersion) || expectedVersion < 1) {
    const err = new Error('expected_version must be a positive integer');
    err.statusCode = 422;
    throw err;
  }

  const existingAction = await getActionByCommandId(userId, commandId);
  if (existingAction) {
    const { data: existingExercise, error: existingExerciseError } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('id', existingAction.exercise_id)
      .maybeSingle();
    if (existingExerciseError) throw existingExerciseError;
    if (!existingExercise) {
      const err = new Error('Exercise not found for existing command_id');
      err.statusCode = 404;
      throw err;
    }
    return {
      exercise_id: existingExercise.id,
      payload_version: existingExercise.payload_version,
      status: existingExercise.status,
      payload_json: existingExercise.payload_json
    };
  }

  const exercise = await getExerciseWithOwnership(exerciseId, userId);
  if (exercise.payload_version !== expectedVersion) {
    const err = new Error('Version conflict');
    err.statusCode = 409;
    err.currentPayloadVersion = exercise.payload_version;
    throw err;
  }

  const currentPayload = normalizePayload(exercise.payload_json || {});
  const reducerOutput = applyCommandReducer(currentPayload, exercise.status, normalizedCommand);
  const nextVersion = expectedVersion + 1;
  const completedAt = reducerOutput.status === 'completed' ? nowIso() : (reducerOutput.status === 'skipped' ? null : exercise.completed_at);

  const { data: updatedExercise, error: updateError } = await supabase
    .from('workout_exercises')
    .update({
      payload_json: reducerOutput.payload,
      payload_version: nextVersion,
      status: reducerOutput.status,
      exercise_name: reducerOutput.metrics.exercise_name,
      exercise_rpe: reducerOutput.metrics.exercise_rpe,
      total_reps: reducerOutput.metrics.total_reps,
      volume: reducerOutput.metrics.volume,
      duration_sec: reducerOutput.metrics.duration_sec,
      completed_at: completedAt,
      updated_at: nowIso()
    })
    .eq('id', exercise.id)
    .select('*')
    .single();
  if (updateError) throw updateError;

  const actionPayload = {
    command: normalizedCommand,
    expected_version: expectedVersion,
    resulting_version: nextVersion,
    resulting_status: reducerOutput.status
  };

  const { error: actionError } = await supabase
    .from('workout_action_logs')
    .insert({
      user_id: userId,
      session_id: exercise.session.id,
      workout_id: exercise.workout_id,
      exercise_id: exercise.id,
      command_id: commandId,
      action_type: normalizedCommand.type,
      action_payload_json: actionPayload,
      source_screen: clientMeta.source_screen || null,
      app_version: clientMeta.app_version || null,
      device_id: clientMeta.device_id || null,
      correlation_id: clientMeta.correlation_id || null,
      client_timestamp: clientMeta.client_timestamp || null
    });

  if (actionError) {
    console.error('Failed to write workout_action_logs entry:', actionError.message || actionError);
  }

  return {
    exercise_id: updatedExercise.id,
    payload_version: updatedExercise.payload_version,
    status: updatedExercise.status,
    payload_json: updatedExercise.payload_json
  };
}

async function finalizeSession({ userId, sessionId, reflection = {}, mode = 'complete', reason = null }) {
  const detail = await getSessionDetail({ sessionId, userId });
  const workout = detail.workout;
  const exercises = detail.exercises;

  const summary = createSummaryFromExercises(workout, exercises, reflection);
  const status = mode === 'stop' ? 'stopped' : 'completed';
  const now = nowIso();

  const sessionUpdate = {
    status,
    completed_at: now,
    session_rpe: Number.isFinite(reflection?.rpe) ? reflection.rpe : null,
    notes: reflection?.notes || null,
    summary_json: {
      ...summary,
      stop_reason: mode === 'stop' ? (reason || 'user_stopped') : null
    },
    updated_at: now
  };

  const { error: sessionUpdateError } = await supabase
    .from('workout_sessions')
    .update(sessionUpdate)
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (sessionUpdateError) throw sessionUpdateError;

  if (workout?.id) {
    const started = detail.session?.started_at ? new Date(detail.session.started_at).getTime() : null;
    const ended = new Date(now).getTime();
    const actualDurationMin = started ? Math.max(0, Math.round((ended - started) / 60000)) : null;
    await supabase
      .from('workouts')
      .update({
        actual_duration_min: actualDurationMin,
        updated_at: now
      })
      .eq('id', workout.id);
  }

  return summary;
}

async function listHistory({ userId, limit = 20, cursor = null }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  let query = supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['completed', 'stopped', 'canceled'])
    .order('started_at', { ascending: false })
    .limit(safeLimit + 1);

  if (cursor) {
    query = query.lt('started_at', cursor);
  }

  const { data: sessions, error: sessionError } = await query;
  if (sessionError) throw sessionError;

  const rows = sessions || [];
  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const sessionIds = pageRows.map(row => row.id);
  if (!sessionIds.length) {
    return {
      items: [],
      next_cursor: null
    };
  }

  const { data: workouts, error: workoutError } = await supabase
    .from('workouts')
    .select('*')
    .in('session_id', sessionIds);
  if (workoutError) throw workoutError;

  const workoutBySession = new Map((workouts || []).map(workout => [workout.session_id, workout]));
  const workoutIds = (workouts || []).map(workout => workout.id);

  let exerciseRows = [];
  if (workoutIds.length) {
    const { data, error } = await supabase
      .from('workout_exercises')
      .select('*')
      .in('workout_id', workoutIds);
    if (error) throw error;
    exerciseRows = data || [];
  }

  const byWorkout = new Map();
  for (const row of exerciseRows) {
    if (!byWorkout.has(row.workout_id)) byWorkout.set(row.workout_id, []);
    byWorkout.get(row.workout_id).push(row);
  }

  const items = pageRows.map(session => {
    const workout = workoutBySession.get(session.id) || null;
    const exercises = workout ? (byWorkout.get(workout.id) || []) : [];
    const completedExercises = exercises.filter(ex => ex.status === 'completed').length;
    const skippedExercises = exercises.filter(ex => ex.status === 'skipped').length;
    const totalVolume = exercises.reduce((sum, ex) => sum + Number(ex.volume || 0), 0);

    return {
      session_id: session.id,
      status: session.status,
      started_at: session.started_at,
      completed_at: session.completed_at,
      title: workout?.title || 'Workout',
      workout_type: workout?.workout_type || null,
      planned_duration_min: workout?.planned_duration_min || null,
      actual_duration_min: workout?.actual_duration_min || null,
      exercise_count: exercises.length,
      completed_exercise_count: completedExercises,
      skipped_exercise_count: skippedExercises,
      total_volume: Math.round(totalVolume),
      session_rpe: session.session_rpe || null
    };
  });

  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.started_at || null : null;

  return {
    items,
    next_cursor: nextCursor
  };
}

module.exports = {
  CURRENT_PAYLOAD_SCHEMA_VERSION,
  exercisePayloadSchema,
  commandSchema,
  buildInitialPayload,
  normalizePayload,
  applyCommandReducer,
  deriveExerciseMetrics,
  planWorkoutIntent,
  createWorkoutSession,
  getSessionDetail,
  applyExerciseCommand,
  finalizeSession,
  listHistory
};
