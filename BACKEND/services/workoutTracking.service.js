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

function wrapSchemaError(error, tableName) {
  if (!error) return error;

  const code = String(error.code || '');
  if (code !== 'PGRST205') return error;

  const wrapped = new Error(
    `Workout tracking database schema is missing table '${tableName}'. Ensure trainer workout tables exist in Supabase and refresh schema cache.`
  );
  wrapped.statusCode = 503;
  wrapped.code = 'WORKOUT_TRACKING_SCHEMA_MISSING';
  wrapped.details = {
    table: tableName,
    supabase_code: error.code || null,
    supabase_hint: error.hint || null
  };
  return wrapped;
}

function throwIfSupabaseError(error, tableName) {
  if (!error) return;
  throw wrapSchemaError(error, tableName);
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

function getExerciseSetStats(exercise = {}) {
  const payload = exercise?.payload_json || {};
  const performanceSets = Array.isArray(payload?.performance?.sets) ? payload.performance.sets : [];
  const prescriptionSets = Array.isArray(payload?.prescription?.sets) ? payload.prescription.sets : [];
  const totalSets = Math.max(performanceSets.length, prescriptionSets.length);
  const completedSets = performanceSets.filter(hasAnySetPerformance).length;

  return {
    totalSets,
    completedSets
  };
}

function buildCompletionSnapshot(exercises = []) {
  const snapshot = {
    completed_sets_total: 0,
    completed_exercises_total: 0,
    unfinished_sets_total: 0,
    unfinished_exercise_ids: []
  };

  for (const exercise of exercises) {
    const status = exercise?.status || 'pending';
    const { totalSets, completedSets } = getExerciseSetStats(exercise);
    const isSkipped = status === 'skipped';
    const isCompleted = status === 'completed';
    const isFinished = isSkipped || isCompleted;

    snapshot.completed_sets_total += completedSets;
    if (isFinished) {
      snapshot.completed_exercises_total += 1;
      continue;
    }

    const remainingSets = Math.max(totalSets - completedSets, 0);
    if (remainingSets > 0) {
      snapshot.unfinished_sets_total += remainingSets;
      if (exercise?.id) snapshot.unfinished_exercise_ids.push(exercise.id);
    }
  }

  return {
    ...snapshot,
    completed_all: snapshot.unfinished_exercise_ids.length === 0
  };
}

function hasCompletedAnySet(exercise = {}) {
  const { completedSets } = getExerciseSetStats(exercise);
  return completedSets > 0;
}

async function getSessionRow(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  throwIfSupabaseError(error, 'trainer_workout_sessions');
  return data || null;
}

async function getLatestInstanceRow(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_instances')
    .select('*')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1);
  throwIfSupabaseError(error, 'trainer_workout_instances');
  return data?.[0] || null;
}

async function listLatestInstanceRows(sessionIds = []) {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('trainer_workout_instances')
    .select('*')
    .in('session_id', sessionIds)
    .order('version', { ascending: false });
  throwIfSupabaseError(error, 'trainer_workout_instances');

  const latestBySession = new Map();
  for (const row of (data || [])) {
    if (!latestBySession.has(row.session_id)) {
      latestBySession.set(row.session_id, row);
    }
  }
  return Array.from(latestBySession.values());
}

async function getLatestSummaryRows(sessionIds = []) {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('trainer_session_summaries')
    .select('*')
    .in('session_id', sessionIds)
    .order('version', { ascending: false });
  throwIfSupabaseError(error, 'trainer_session_summaries');

  const latestBySession = new Map();
  for (const row of (data || [])) {
    if (!latestBySession.has(row.session_id)) {
      latestBySession.set(row.session_id, row);
    }
  }
  return Array.from(latestBySession.values());
}

function sanitizeExerciseStatus(value, fallback = 'pending') {
  if (value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'skipped') {
    return value;
  }
  return fallback;
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

function ensureUuid(value, fallbackFactory = () => uuidv4()) {
  if (typeof value === 'string' && isUuid(value)) return value;
  return fallbackFactory();
}

function computeDurationMin(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

function ensureTrackingContainer(instanceJson = {}) {
  const next = cloneJson(instanceJson || {});
  if (!next._tracking || typeof next._tracking !== 'object' || Array.isArray(next._tracking)) {
    next._tracking = {};
  }
  if (!next._tracking.command_results || typeof next._tracking.command_results !== 'object' || Array.isArray(next._tracking.command_results)) {
    next._tracking.command_results = {};
  }
  if (!Array.isArray(next.exercises)) {
    next.exercises = [];
  }
  if (!next.metadata || typeof next.metadata !== 'object' || Array.isArray(next.metadata)) {
    next.metadata = {};
  }
  return next;
}

function getCommandResults(instanceJson = {}) {
  const commandResults = instanceJson?._tracking?.command_results;
  if (!commandResults || typeof commandResults !== 'object' || Array.isArray(commandResults)) {
    return {};
  }
  return commandResults;
}

function deriveTrackedExerciseRows(instanceJson, workoutId) {
  const source = ensureTrackingContainer(instanceJson);
  const rows = [];
  let didNormalize = false;

  for (let index = 0; index < source.exercises.length; index += 1) {
    const exercise = source.exercises[index] || {};
    const exerciseId = ensureUuid(exercise.id);
    if (exercise.id !== exerciseId) didNormalize = true;

    const tracking = exercise._tracking && typeof exercise._tracking === 'object' && !Array.isArray(exercise._tracking)
      ? exercise._tracking
      : {};
    if (!exercise._tracking || typeof exercise._tracking !== 'object' || Array.isArray(exercise._tracking)) {
      didNormalize = true;
    }

    let payload;
    try {
      const basePayload = tracking.payload_json || buildInitialPayload({ ...exercise, id: exerciseId });
      payload = normalizePayload(basePayload);
      if (!tracking.payload_json) didNormalize = true;
    } catch (error) {
      payload = normalizePayload(buildInitialPayload({ ...exercise, id: exerciseId }));
      didNormalize = true;
    }

    const derivedStatus = sanitizeExerciseStatus(deriveExerciseStatus(payload, 'pending'));
    const status = sanitizeExerciseStatus(tracking.status, derivedStatus);
    const metrics = deriveExerciseMetrics(payload);
    const payloadVersion = Number.isFinite(tracking.payload_version) && tracking.payload_version >= 1
      ? Math.round(tracking.payload_version)
      : 1;
    if (!Number.isFinite(tracking.payload_version) || tracking.payload_version < 1) {
      didNormalize = true;
    }

    rows.push({
      id: exerciseId,
      workout_id: workoutId,
      exercise_order: index,
      exercise_type: payload.identity.type,
      status,
      payload_json: payload,
      payload_version: payloadVersion,
      exercise_name: metrics.exercise_name,
      exercise_rpe: metrics.exercise_rpe,
      total_reps: metrics.total_reps,
      volume: metrics.volume,
      duration_sec: metrics.duration_sec,
      completed_at: tracking.completed_at || null,
      created_at: null,
      updated_at: null
    });
  }

  return { rows, didNormalize };
}

function buildStoredInstanceFromRows(baseInstance, rows, commandResults = {}) {
  const next = ensureTrackingContainer(baseInstance);
  const originalExercises = Array.isArray(next.exercises) ? next.exercises : [];

  next.exercises = rows.map((row, index) => {
    const original = cloneJson(originalExercises[index] || {});
    const uiExercise = mapPayloadToUIExercise(row);
    const merged = mergeExerciseMetadata(original, uiExercise, row.id);

    merged._tracking = {
      status: row.status,
      payload_json: row.payload_json,
      payload_version: row.payload_version,
      completed_at: row.completed_at || null,
      exercise_name: row.exercise_name,
      exercise_rpe: row.exercise_rpe,
      total_reps: row.total_reps,
      volume: row.volume,
      duration_sec: row.duration_sec
    };

    return merged;
  });

  next._tracking.command_results = {
    ...(getCommandResults(next)),
    ...(commandResults || {})
  };

  return next;
}

function mergeExerciseMetadata(original, trackedExercise, rowId) {
  const merged = {
    ...original,
    ...trackedExercise,
    id: rowId
  };

  // Preserve generated metadata not represented in tracking payload.
  merged.muscles_utilized = original.muscles_utilized ?? trackedExercise.muscles_utilized ?? null;
  merged.goals_addressed = original.goals_addressed ?? trackedExercise.goals_addressed ?? null;
  merged.reasoning = original.reasoning ?? trackedExercise.reasoning ?? null;
  merged.equipment = original.equipment ?? trackedExercise.equipment ?? null;
  merged.exercise_description = original.exercise_description ?? trackedExercise.exercise_description ?? null;

  return merged;
}

function buildClientInstance(storedInstance, rows) {
  const client = cloneJson(storedInstance || {});
  delete client._tracking;
  const originalExercises = Array.isArray(client.exercises) ? client.exercises : [];
  client.exercises = rows.map((row, index) => {
    const original = cloneJson(originalExercises[index] || {});
    const trackedExercise = mapPayloadToUIExercise(row);
    return mergeExerciseMetadata(original, trackedExercise, row.id);
  });
  if (!client.metadata || typeof client.metadata !== 'object' || Array.isArray(client.metadata)) {
    client.metadata = {};
  }
  if (!client.metadata.generated_at) {
    client.metadata.generated_at = nowIso();
  }
  return client;
}

function formatWorkoutForClient(instanceRow, clientInstance, sessionRow) {
  if (!instanceRow || !clientInstance) return null;
  return {
    id: instanceRow.id,
    session_id: instanceRow.session_id,
    title: clientInstance.title || 'Workout',
    workout_type: Array.isArray(clientInstance.focus) && clientInstance.focus.length
      ? clientInstance.focus[0]
      : null,
    planned_duration_min: Number.isFinite(clientInstance.estimated_duration_min)
      ? Math.round(clientInstance.estimated_duration_min)
      : null,
    actual_duration_min: computeDurationMin(sessionRow?.started_at, sessionRow?.completed_at),
    created_at: instanceRow.created_at || null,
    updated_at: sessionRow?.updated_at || null
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

async function persistNormalizedInstance(instanceRow, storedInstance) {
  const { error } = await supabase
    .from('trainer_workout_instances')
    .update({ instance_json: storedInstance })
    .eq('id', instanceRow.id);
  throwIfSupabaseError(error, 'trainer_workout_instances');
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

  const instanceRow = await getLatestInstanceRow(sessionId);
  if (!instanceRow) {
    return {
      session: formatSessionForClient(sessionRow),
      workout: null,
      exercises: [],
      instance: null,
      instance_version: null
    };
  }

  const tracked = deriveTrackedExerciseRows(instanceRow.instance_json || {}, instanceRow.id);
  const storedInstance = buildStoredInstanceFromRows(
    instanceRow.instance_json || {},
    tracked.rows,
    getCommandResults(instanceRow.instance_json || {})
  );

  if (tracked.didNormalize) {
    await persistNormalizedInstance(instanceRow, storedInstance);
  }

  const clientInstance = buildClientInstance(storedInstance, tracked.rows);
  return {
    session: formatSessionForClient(sessionRow),
    workout: formatWorkoutForClient(instanceRow, clientInstance, sessionRow),
    exercises: tracked.rows.map(formatExerciseRowForClient),
    instance: clientInstance,
    instance_version: instanceRow.version || 1
  };
}

async function getNextEventSequence(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1);
  throwIfSupabaseError(error, 'trainer_workout_events');
  return (Number(data?.[0]?.sequence_number) || 0) + 1;
}

async function appendWorkoutEvent({ sessionId, eventType, data = {} }) {
  const sequenceNumber = await getNextEventSequence(sessionId);
  const { error } = await supabase
    .from('trainer_workout_events')
    .insert({
      session_id: sessionId,
      sequence_number: sequenceNumber,
      event_type: eventType,
      timestamp: nowIso(),
      data
    });
  throwIfSupabaseError(error, 'trainer_workout_events');
}

async function cleanupSessionArtifacts({ sessionId, userId }) {
  await supabase.from('trainer_workout_events').delete().eq('session_id', sessionId);
  await supabase.from('trainer_session_summaries').delete().eq('session_id', sessionId);
  await supabase.from('trainer_workout_logs').delete().eq('session_id', sessionId);
  await supabase.from('trainer_workout_instances').delete().eq('session_id', sessionId);
  await supabase
    .from('trainer_workout_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);
}

async function createWorkoutSession({ userId, requestBody = {} }) {
  const parsed = createSessionRequestSchema.parse(requestBody);

  const sessionId = uuidv4();
  const metadata = {
    ...(parsed.metadata || {})
  };
  if (parsed.planned_intent_original) metadata.planned_intent_original = parsed.planned_intent_original;
  if (parsed.planned_intent_edited) metadata.planned_intent_edited = parsed.planned_intent_edited;

  const sessionInsert = {
    id: sessionId,
    user_id: userId,
    status: 'in_progress',
    coach_mode: parsed.coach_mode || 'quiet',
    started_at: nowIso(),
    planned_session_id: parsed.planned_session_id || null,
    calendar_event_id: parsed.calendar_event_id || null,
    metadata
  };

  const { error: sessionError } = await supabase
    .from('trainer_workout_sessions')
    .insert(sessionInsert);
  throwIfSupabaseError(sessionError, 'trainer_workout_sessions');

  try {
    await appendWorkoutEvent({
      sessionId,
      eventType: 'session_started',
      data: {
        source: 'api',
        started_at: sessionInsert.started_at,
        coach_mode: sessionInsert.coach_mode
      }
    });

    const constraints = {
      intent: parsed.intent || 'planned',
      request_text: parsed.request_text || null,
      time_available_min: parsed.time_available_min || null,
      equipment: parsed.equipment || [],
      planned_session: parsed.planned_session || null,
      planned_intent_original: parsed.planned_intent_original || null,
      planned_intent_edited: parsed.planned_intent_edited || null
    };

    const generatedInstance = await workoutGenerationService.generateWorkoutInstance(userId, constraints);
    const tracked = deriveTrackedExerciseRows(generatedInstance || {}, sessionId);
    const storedInstance = buildStoredInstanceFromRows(generatedInstance || {}, tracked.rows, {});

    const { error: instanceError } = await supabase
      .from('trainer_workout_instances')
      .insert({
        session_id: sessionId,
        version: 1,
        instance_json: storedInstance
      });
    throwIfSupabaseError(instanceError, 'trainer_workout_instances');

    await appendWorkoutEvent({
      sessionId,
      eventType: 'instance_generated',
      data: {
        version: 1,
        exercise_count: tracked.rows.length,
        intent: constraints.intent
      }
    });

    return getSessionDetail({ sessionId, userId });
  } catch (error) {
    try {
      await cleanupSessionArtifacts({ sessionId, userId });
    } catch (cleanupError) {
      console.error('Failed to cleanup workout session artifacts:', cleanupError);
    }
    throw wrapSchemaError(error, 'trainer_workout_sessions');
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

async function findExerciseContextById(userId, exerciseId) {
  const { data: sessions, error: sessionsError } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['in_progress', 'completed', 'stopped'])
    .order('started_at', { ascending: false })
    .limit(50);
  throwIfSupabaseError(sessionsError, 'trainer_workout_sessions');

  const sessionRows = sessions || [];
  if (!sessionRows.length) return null;

  const sessionById = new Map(sessionRows.map(row => [row.id, row]));
  const instanceRows = await listLatestInstanceRows(sessionRows.map(row => row.id));

  for (const instanceRow of instanceRows) {
    const tracked = deriveTrackedExerciseRows(instanceRow.instance_json || {}, instanceRow.id);
    const index = tracked.rows.findIndex(row => row.id === exerciseId);
    if (index < 0) continue;

    const storedInstance = buildStoredInstanceFromRows(
      instanceRow.instance_json || {},
      tracked.rows,
      getCommandResults(instanceRow.instance_json || {})
    );

    return {
      sessionRow: sessionById.get(instanceRow.session_id),
      instanceRow,
      trackedRows: tracked.rows,
      exerciseIndex: index,
      exerciseRow: tracked.rows[index],
      storedInstance,
      didNormalize: tracked.didNormalize
    };
  }

  return null;
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

  const context = await findExerciseContextById(userId, exerciseId);
  if (!context) {
    const notFound = new Error('Exercise not found');
    notFound.statusCode = 404;
    throw notFound;
  }
  if (!context.sessionRow || context.sessionRow.user_id !== userId) {
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    throw forbidden;
  }
  if (context.sessionRow.status !== 'in_progress') {
    const err = new Error('Session is not active');
    err.statusCode = 409;
    throw err;
  }

  const commandResults = getCommandResults(context.storedInstance);
  const existingResult = commandResults[commandId];
  if (existingResult && existingResult.exercise_id === exerciseId) {
    return {
      exercise_id: existingResult.exercise_id,
      payload_version: existingResult.payload_version,
      status: existingResult.status,
      payload_json: existingResult.payload_json
    };
  }

  if (context.exerciseRow.payload_version !== expectedVersion) {
    const err = new Error('Version conflict');
    err.statusCode = 409;
    err.currentPayloadVersion = context.exerciseRow.payload_version;
    throw err;
  }

  const reducerOutput = applyCommandReducer(
    context.exerciseRow.payload_json || {},
    context.exerciseRow.status,
    normalizedCommand
  );
  const nextPayloadVersion = expectedVersion + 1;
  const completedAt = reducerOutput.status === 'completed'
    ? nowIso()
    : (reducerOutput.status === 'skipped' ? null : context.exerciseRow.completed_at);

  const updatedExerciseRow = {
    ...context.exerciseRow,
    status: reducerOutput.status,
    payload_json: reducerOutput.payload,
    payload_version: nextPayloadVersion,
    exercise_name: reducerOutput.metrics.exercise_name,
    exercise_rpe: reducerOutput.metrics.exercise_rpe,
    total_reps: reducerOutput.metrics.total_reps,
    volume: reducerOutput.metrics.volume,
    duration_sec: reducerOutput.metrics.duration_sec,
    completed_at: completedAt
  };

  const nextRows = [...context.trackedRows];
  nextRows[context.exerciseIndex] = updatedExerciseRow;

  const commandResult = {
    exercise_id: updatedExerciseRow.id,
    payload_version: updatedExerciseRow.payload_version,
    status: updatedExerciseRow.status,
    payload_json: updatedExerciseRow.payload_json
  };
  const nextCommandResults = {
    ...commandResults,
    [commandId]: commandResult
  };

  const updatedInstance = buildStoredInstanceFromRows(context.storedInstance, nextRows, nextCommandResults);
  const nextInstanceVersion = (Number(context.instanceRow.version) || 1) + 1;

  const { error: instanceInsertError } = await supabase
    .from('trainer_workout_instances')
    .insert({
      session_id: context.sessionRow.id,
      version: nextInstanceVersion,
      instance_json: updatedInstance
    });
  throwIfSupabaseError(instanceInsertError, 'trainer_workout_instances');

  const { error: sessionTouchError } = await supabase
    .from('trainer_workout_sessions')
    .update({ updated_at: nowIso() })
    .eq('id', context.sessionRow.id)
    .eq('user_id', userId);
  throwIfSupabaseError(sessionTouchError, 'trainer_workout_sessions');

  await appendWorkoutEvent({
    sessionId: context.sessionRow.id,
    eventType: 'action',
    data: {
      command_id: commandId,
      exercise_id: updatedExerciseRow.id,
      expected_version: expectedVersion,
      resulting_version: nextPayloadVersion,
      resulting_status: updatedExerciseRow.status,
      command: normalizedCommand,
      client_meta: clientMeta || {}
    }
  });

  return commandResult;
}

async function getNextSummaryVersion(sessionId) {
  const { data, error } = await supabase
    .from('trainer_session_summaries')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1);
  throwIfSupabaseError(error, 'trainer_session_summaries');
  return (Number(data?.[0]?.version) || 0) + 1;
}

async function finalizeSession({ userId, sessionId, reflection = {}, mode = 'complete', reason = null }) {
  let detail = await getSessionDetail({ sessionId, userId });
  let workout = detail.workout;
  let exercises = detail.exercises;

  if (!detail.session) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  const autoSkippedExerciseIds = [];
  if (mode === 'complete') {
    const untouchedExercises = exercises.filter(exercise => {
      if (!exercise || exercise.status === 'skipped' || exercise.status === 'completed') return false;
      return !hasCompletedAnySet(exercise);
    });

    for (const exercise of untouchedExercises) {
      try {
        await applyExerciseCommand({
          userId,
          exerciseId: exercise.id,
          commandId: uuidv4(),
          expectedVersion: exercise.payload_version,
          command: {
            type: 'skip_exercise',
            reason: 'auto_skipped_on_early_finish'
          },
          clientMeta: {
            source_screen: 'session_finalize',
            trigger: 'complete_workout',
            reason: 'auto_skip_untouched'
          }
        });
        autoSkippedExerciseIds.push(exercise.id);
      } catch (error) {
        console.error('Failed to auto-skip untouched exercise on finalize:', {
          sessionId,
          exerciseId: exercise.id,
          message: error?.message
        });
      }
    }

    if (untouchedExercises.length > 0) {
      detail = await getSessionDetail({ sessionId, userId });
      workout = detail.workout;
      exercises = detail.exercises;
    }
  }

  const completionSnapshot = buildCompletionSnapshot(exercises);
  const isEarlyCompletion = mode === 'complete'
    && (autoSkippedExerciseIds.length > 0 || !completionSnapshot.completed_all);
  const completedAll = mode === 'complete' ? !isEarlyCompletion : completionSnapshot.completed_all;
  const completionReason = mode === 'stop'
    ? (reason || 'user_stopped')
    : (isEarlyCompletion ? 'user_ended_early' : null);

  const summary = createSummaryFromExercises(workout, exercises, reflection);
  const status = mode === 'stop' ? 'stopped' : 'completed';
  const now = nowIso();
  const actualDurationMin = computeDurationMin(detail.session.started_at, now);

  const { error: sessionUpdateError } = await supabase
    .from('trainer_workout_sessions')
    .update({
      status,
      completed_at: now,
      updated_at: now
    })
    .eq('id', sessionId)
    .eq('user_id', userId);
  throwIfSupabaseError(sessionUpdateError, 'trainer_workout_sessions');

  const logJson = {
    reflection: reflection || {},
    summary: {
      ...summary,
      stop_reason: mode === 'stop' ? (reason || 'user_stopped') : null,
      completed_all: completedAll,
      unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
      unfinished_sets_total: completionSnapshot.unfinished_sets_total,
      completed_sets_total: completionSnapshot.completed_sets_total,
      completed_exercises_total: completionSnapshot.completed_exercises_total
    },
    completion_mode: mode,
    reason: completionReason,
    completed_all: completedAll,
    unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
    unfinished_sets_total: completionSnapshot.unfinished_sets_total,
    completed_sets_total: completionSnapshot.completed_sets_total,
    completed_exercises_total: completionSnapshot.completed_exercises_total,
    auto_skipped_exercise_ids: autoSkippedExerciseIds,
    actual_duration_min: actualDurationMin,
    completed_at: now
  };

  const { error: logUpsertError } = await supabase
    .from('trainer_workout_logs')
    .upsert({
      session_id: sessionId,
      log_json: logJson
    }, { onConflict: 'session_id' });
  throwIfSupabaseError(logUpsertError, 'trainer_workout_logs');

  const summaryVersion = await getNextSummaryVersion(sessionId);
  const { error: summaryInsertError } = await supabase
    .from('trainer_session_summaries')
    .insert({
      session_id: sessionId,
      version: summaryVersion,
      summary_json: {
        ...summary,
        stop_reason: mode === 'stop' ? (reason || 'user_stopped') : null,
        completed_all: completedAll,
        unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
        unfinished_sets_total: completionSnapshot.unfinished_sets_total,
        completed_sets_total: completionSnapshot.completed_sets_total,
        completed_exercises_total: completionSnapshot.completed_exercises_total
      }
    });
  throwIfSupabaseError(summaryInsertError, 'trainer_session_summaries');

  if (isEarlyCompletion) {
    await appendWorkoutEvent({
      sessionId,
      eventType: 'session_ended_early',
      data: {
      reason: 'user_ended_early',
      unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
      unfinished_sets_total: completionSnapshot.unfinished_sets_total,
      completed_sets_total: completionSnapshot.completed_sets_total,
      completed_exercises_total: completionSnapshot.completed_exercises_total,
      auto_skipped_exercise_ids: autoSkippedExerciseIds
      }
    });
  }

  await appendWorkoutEvent({
    sessionId,
    eventType: 'session_completed',
    data: {
      mode,
      reason: completionReason,
      summary_version: summaryVersion,
      completed_all: completedAll,
      unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
      unfinished_sets_total: completionSnapshot.unfinished_sets_total,
      auto_skipped_exercise_ids: autoSkippedExerciseIds
    }
  });

  return {
    ...summary,
    completed_all: completedAll,
    unfinished_exercise_ids: completionSnapshot.unfinished_exercise_ids,
    unfinished_sets_total: completionSnapshot.unfinished_sets_total,
    completed_sets_total: completionSnapshot.completed_sets_total,
    completed_exercises_total: completionSnapshot.completed_exercises_total
  };
}

async function listHistory({ userId, limit = 20, cursor = null }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  let query = supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['completed', 'stopped', 'canceled'])
    .order('started_at', { ascending: false })
    .limit(safeLimit + 1);

  if (cursor) {
    query = query.lt('started_at', cursor);
  }

  const { data: sessions, error: sessionError } = await query;
  throwIfSupabaseError(sessionError, 'trainer_workout_sessions');

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

  const latestInstances = await listLatestInstanceRows(sessionIds);
  const instanceBySession = new Map(latestInstances.map(row => [row.session_id, row]));

  const { data: logs, error: logsError } = await supabase
    .from('trainer_workout_logs')
    .select('session_id, log_json')
    .in('session_id', sessionIds);
  throwIfSupabaseError(logsError, 'trainer_workout_logs');
  const logBySession = new Map((logs || []).map(row => [row.session_id, row.log_json || {}]));

  const latestSummaries = await getLatestSummaryRows(sessionIds);
  const summaryBySession = new Map(latestSummaries.map(row => [row.session_id, row.summary_json || {}]));

  const items = pageRows.map(session => {
    const instanceRow = instanceBySession.get(session.id) || null;
    const tracked = instanceRow
      ? deriveTrackedExerciseRows(instanceRow.instance_json || {}, instanceRow.id)
      : { rows: [] };
    const stored = instanceRow
      ? buildStoredInstanceFromRows(
        instanceRow.instance_json || {},
        tracked.rows,
        getCommandResults(instanceRow.instance_json || {})
      )
      : null;
    const clientInstance = stored ? buildClientInstance(stored, tracked.rows) : null;

    const completedExercises = tracked.rows.filter(ex => ex.status === 'completed').length;
    const skippedExercises = tracked.rows.filter(ex => ex.status === 'skipped').length;
    const totalVolume = tracked.rows.reduce((sum, ex) => sum + Number(ex.volume || 0), 0);
    const logJson = logBySession.get(session.id) || {};
    const summaryJson = summaryBySession.get(session.id) || {};

    const actualDurationFromLog = Number(logJson.actual_duration_min);
    const actualDurationMin = Number.isFinite(actualDurationFromLog)
      ? actualDurationFromLog
      : computeDurationMin(session.started_at, session.completed_at);

    const sessionRpe = Number(logJson?.reflection?.rpe);
    const summaryRpe = Number(summaryJson?.overall_rpe);
    const resolvedSessionRpe = Number.isFinite(sessionRpe)
      ? sessionRpe
      : (Number.isFinite(summaryRpe) ? summaryRpe : null);

    return {
      session_id: session.id,
      status: session.status,
      started_at: session.started_at,
      completed_at: session.completed_at,
      title: clientInstance?.title || 'Workout',
      workout_type: Array.isArray(clientInstance?.focus) && clientInstance.focus.length
        ? clientInstance.focus[0]
        : null,
      planned_duration_min: Number.isFinite(clientInstance?.estimated_duration_min)
        ? Math.round(clientInstance.estimated_duration_min)
        : null,
      actual_duration_min: actualDurationMin,
      exercise_count: tracked.rows.length,
      completed_exercise_count: completedExercises,
      skipped_exercise_count: skippedExercises,
      total_volume: Math.round(totalVolume),
      session_rpe: resolvedSessionRpe
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
