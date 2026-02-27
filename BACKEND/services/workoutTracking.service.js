const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { z } = require('zod');
const { v4: uuidv4, validate: isUuid } = require('uuid');
const workoutGenerationService = require('./workoutGeneration.service');
const { getAnthropicClient } = require('./modelProviders.service');
const locationService = require('./location.service');
const {
  dailyMessageLlmContextSchema,
  buildDailyMessageLlmRequest,
  parseDailyMessageResponseText
} = require('./dailyMessageLLM.service');

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
  location_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  coach_mode: z.enum(['quiet', 'ringer']).optional(),
  planned_session: z.record(z.string(), z.any()).nullable().optional(),
  planned_intent_original: z.record(z.string(), z.any()).nullable().optional(),
  planned_intent_edited: z.record(z.string(), z.any()).nullable().optional(),
  calendar_event_id: z.string().uuid().nullable().optional(),
  planned_session_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).strict();

const DAILY_MESSAGE_FALLBACK_TIMEZONE = 'UTC';

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
  const parsedLocationId = parsed.location_id === undefined || parsed.location_id === null
    ? null
    : locationService.parseLocationId(parsed.location_id);
  if (parsed.location_id !== undefined && parsed.location_id !== null && !parsedLocationId) {
    const err = new Error('location_id must be a positive integer');
    err.statusCode = 422;
    throw err;
  }

  let selectedLocation = null;
  if (parsedLocationId) {
    const { data: locationRow, error: locationError } = await supabase
      .from('user_locations')
      .select('id, name, equipment, current_location')
      .eq('user_id', userId)
      .eq('id', parsedLocationId)
      .maybeSingle();
    throwIfSupabaseError(locationError, 'user_locations');
    if (!locationRow) {
      const err = new Error('Location not found');
      err.statusCode = 404;
      throw err;
    }
    selectedLocation = locationRow;
  }

  const sessionId = uuidv4();
  const metadata = {
    ...(parsed.metadata || {})
  };
  if (parsedLocationId) {
    metadata.location_id = parsedLocationId;
    metadata.location_name = selectedLocation?.name || null;
  }
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

    const locationEquipment = locationService.getLocationEquipmentSummary(selectedLocation);
    const explicitEquipment = Array.isArray(parsed.equipment) && parsed.equipment.length > 0
      ? parsed.equipment
      : null;
    const constraints = {
      intent: parsed.intent || 'planned',
      request_text: parsed.request_text || null,
      time_available_min: parsed.time_available_min || null,
      equipment: explicitEquipment || locationEquipment,
      location_id: parsedLocationId || null,
      location_name: selectedLocation?.name || null,
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
  const sessionRow = await getSessionRow(sessionId);
  if (!sessionRow) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }
  if (sessionRow.user_id !== userId) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

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

  if (mode === 'complete' && sessionRow.calendar_event_id) {
    const { error: calendarUpdateError } = await supabase
      .from('trainer_calendar_events')
      .update({
        status: 'completed',
        updated_at: now
      })
      .eq('id', sessionRow.calendar_event_id)
      .eq('user_id', userId);

    if (calendarUpdateError) {
      // Calendar status sync should not block workout completion.
      console.error('Failed to mark calendar event completed during session finalize:', {
        sessionId,
        calendarEventId: sessionRow.calendar_event_id,
        message: calendarUpdateError?.message,
        code: calendarUpdateError?.code
      });
    }
  }

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
      calendar_event_id: session.calendar_event_id || null,
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

function normalizeTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return DAILY_MESSAGE_FALLBACK_TIMEZONE;
  const trimmed = timeZone.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return DAILY_MESSAGE_FALLBACK_TIMEZONE;
  }
}

function dateKeyFromDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, deltaDays) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function getWeekStartDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().slice(0, 10);
}

function parsePushVolumeFromExercise(exercise = {}) {
  const tracking = exercise?._tracking && typeof exercise._tracking === 'object'
    ? exercise._tracking
    : {};
  const name = String(exercise.exercise_name || exercise.name || tracking.exercise_name || '').toLowerCase();
  const isPush = /(push|press|bench|dip|tricep|chest)/i.test(name);
  if (!isPush) return null;

  const fromTracking = Number(tracking.volume);
  if (Number.isFinite(fromTracking) && fromTracking > 0) return fromTracking;

  const perfSets = Array.isArray(tracking?.payload_json?.performance?.sets)
    ? tracking.payload_json.performance.sets
    : [];
  let volume = 0;
  for (const set of perfSets) {
    const reps = Number(set?.actual_reps);
    const load = Number(set?.actual_load);
    if (Number.isFinite(reps) && Number.isFinite(load) && reps > 0 && load > 0) {
      volume += reps * load;
    }
  }
  return volume > 0 ? volume : null;
}

function parsePullVolumeFromExercise(exercise = {}) {
  const tracking = exercise?._tracking && typeof exercise._tracking === 'object'
    ? exercise._tracking
    : {};
  const name = String(exercise.exercise_name || exercise.name || tracking.exercise_name || '').toLowerCase();
  const isPull = /(row|pull|lat|chin|curl|rear delt|face pull|bicep)/i.test(name);
  if (!isPull) return null;

  const fromTracking = Number(tracking.volume);
  if (Number.isFinite(fromTracking) && fromTracking > 0) return fromTracking;
  return null;
}

function parseLowerVolumeFromExercise(exercise = {}) {
  const tracking = exercise?._tracking && typeof exercise._tracking === 'object'
    ? exercise._tracking
    : {};
  const name = String(exercise.exercise_name || exercise.name || tracking.exercise_name || '').toLowerCase();
  const isLower = /(squat|deadlift|lunge|split squat|hip thrust|hamstring|quad|calf|glute|leg press)/i.test(name);
  if (!isLower) return null;

  const fromTracking = Number(tracking.volume);
  if (Number.isFinite(fromTracking) && fromTracking > 0) return fromTracking;
  return null;
}

function parseSessionDurationMin(session = {}) {
  const startedAt = session?.started_at;
  const completedAt = session?.completed_at;
  if (!startedAt || !completedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

function toDayOfWeek(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[date.getUTCDay()] || 'monday';
}

function safeString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getMemoryFacts(rows = []) {
  const facts = [];
  for (const row of rows) {
    const key = safeString(row?.key);
    const value = row?.value_json;
    if (!key || !value || typeof value !== 'object') continue;
    const firstEntry = Object.entries(value).find(([, v]) => v !== null && v !== undefined);
    if (!firstEntry) continue;
    const rawValue = firstEntry[1];
    let printable;
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      printable = String(rawValue);
    } else {
      continue;
    }
    const clean = printable.trim();
    if (!clean) continue;
    facts.push(`${key}: ${clean}`);
    if (facts.length >= 5) break;
  }
  return facts;
}

function getLocationEquipmentSummary(locationRow) {
  if (!locationRow) return [];
  if (typeof locationRow.equipment !== 'string') return [];
  return Array.from(new Set(
    locationRow.equipment
      .split(/\r?\n|,/)
      .map(s => safeString(s.replace(/^[-*•]\s*/, '')))
      .filter(Boolean)
  )).slice(0, 20);
}

function buildFallbackDailyMessage(context = {}) {
  const adherence = context.recent_adherence || {};
  const trends = context.performance_trends || {};
  const today = context.today_context || {};
  const parts = [];

  parts.push(`You've completed **${adherence.workouts_completed_week || 0} workouts** this week.`);
  if ((adherence.streak_days || 0) > 0) {
    parts.push(`Day **${adherence.streak_days}** of your streak.`);
  } else {
    parts.push('Build momentum with a workout today.');
  }

  const pushDelta = safeNumber(trends?.split_volume_delta_pct?.push);
  if (pushDelta !== null) {
    if (pushDelta > 0) parts.push(`Push volume trend is **up ${Math.round(pushDelta)}%** over the previous 30 days.`);
    else if (pushDelta < 0) parts.push(`Push volume trend is **down ${Math.abs(Math.round(pushDelta))}%** over the previous 30 days.`);
  }

  const focus = safeString(today?.planned_workout_today?.focus || today?.planned_workout_today?.title);
  if (focus) {
    parts.push(`Today's focus: **${focus}**.`);
  } else {
    parts.push("Let's keep building.");
  }

  return parts.join(' ');
}

async function generateDailyMessageWithLlm(context) {
  const client = getAnthropicClient();
  const request = buildDailyMessageLlmRequest(context);
  const response = await client.messages.create(request);
  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = parseDailyMessageResponseText(textBlock?.text || '');
  return {
    message_text: parsed.message_text,
    model: request.model
  };
}

async function computeDailyMessageContext({ userId, timeZone, todayKey }) {
  const weekStartKey = getWeekStartDateKey(todayKey);
  const last30Start = shiftDateKey(todayKey, -29);
  const previous30Start = shiftDateKey(todayKey, -59);
  const scheduledSearchStart = shiftDateKey(todayKey, -2);
  const weekWindowStart = weekStartKey < shiftDateKey(todayKey, -6)
    ? weekStartKey
    : shiftDateKey(todayKey, -6);
  const tomorrowKey = shiftDateKey(todayKey, 1);

  const [
    sessionsResult,
    scheduledEventsResult,
    weekEventsResult,
    profileResult,
    goalResult,
    locationResult,
    memoryResult,
    checkinResult
  ] = await Promise.all([
    supabase
      .from('trainer_workout_sessions')
      .select('id, status, started_at, completed_at')
      .eq('user_id', userId)
      .in('status', ['completed', 'stopped'])
      .order('started_at', { ascending: false })
      .limit(180),
    supabase
      .from('trainer_calendar_events')
      .select('start_at, title, notes, status')
      .eq('user_id', userId)
      .eq('event_type', 'workout')
      .in('status', ['scheduled', 'planned'])
      .gte('start_at', `${scheduledSearchStart}T00:00:00.000Z`)
      .order('start_at', { ascending: true })
      .limit(240),
    supabase
      .from('trainer_calendar_events')
      .select('start_at, status')
      .eq('user_id', userId)
      .eq('event_type', 'workout')
      .in('status', ['scheduled', 'planned', 'completed', 'skipped'])
      .gte('start_at', `${weekWindowStart}T00:00:00.000Z`)
      .lt('start_at', `${tomorrowKey}T00:00:00.000Z`)
      .order('start_at', { ascending: true }),
    supabase
      .from('app_user')
      .select('first_name')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('trainer_goal_contracts')
      .select('contract_json, status, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('user_locations')
      .select('name, equipment, current_location')
      .eq('user_id', userId)
      .order('current_location', { ascending: false })
      .limit(1),
    supabase
      .from('trainer_user_memory_items')
      .select('key, value_json, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(8),
    supabase
      .from('trainer_checkins')
      .select('summary_json, responses_json, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
  ]);

  throwIfSupabaseError(sessionsResult.error, 'trainer_workout_sessions');
  throwIfSupabaseError(scheduledEventsResult.error, 'trainer_calendar_events');
  throwIfSupabaseError(weekEventsResult.error, 'trainer_calendar_events');
  throwIfSupabaseError(profileResult.error, 'app_user');
  throwIfSupabaseError(goalResult.error, 'trainer_goal_contracts');
  throwIfSupabaseError(locationResult.error, 'user_locations');
  throwIfSupabaseError(memoryResult.error, 'trainer_user_memory_items');
  throwIfSupabaseError(checkinResult.error, 'trainer_checkins');

  const sessions = sessionsResult.data || [];
  const scheduledEvents = scheduledEventsResult.data || [];
  const weekEvents = weekEventsResult.data || [];
  const latestSession = sessions[0] || null;

  const daySet = new Set();
  const dayKeys = [];
  const dayKeyBySession = new Map();
  let weeklyWorkouts = 0;
  let currentSessionCount = 0;
  let previousSessionCount = 0;
  const recentSessionIds = [];
  const durationsCurrent = [];
  const durationsPrevious = [];

  for (const session of sessions) {
    const timestamp = session.completed_at || session.started_at;
    if (!timestamp) continue;
    const dayKey = dateKeyFromDate(new Date(timestamp), timeZone);
    dayKeyBySession.set(session.id, dayKey);
    if (dayKey >= weekStartKey && dayKey <= todayKey) weeklyWorkouts += 1;
    if (!daySet.has(dayKey)) {
      daySet.add(dayKey);
      dayKeys.push(dayKey);
    }

    if (dayKey >= previous30Start) recentSessionIds.push(session.id);

    const duration = parseSessionDurationMin(session);
    if (dayKey >= last30Start) {
      currentSessionCount += 1;
      if (duration !== null) durationsCurrent.push(duration);
    } else if (dayKey >= previous30Start) {
      previousSessionCount += 1;
      if (duration !== null) durationsPrevious.push(duration);
    }
  }

  dayKeys.sort((a, b) => (a < b ? 1 : -1));
  let streakDays = 0;
  if (dayKeys.length) {
    let cursor = dayKeys[0];
    streakDays = 1;
    while (daySet.has(shiftDateKey(cursor, -1))) {
      cursor = shiftDateKey(cursor, -1);
      streakDays += 1;
    }
  }

  const plannedWeek = weekEvents.filter(event => {
    const dayKey = dateKeyFromDate(new Date(event.start_at), timeZone);
    return dayKey >= weekStartKey && dayKey <= todayKey;
  }).length;

  const skippedLast7d = weekEvents.filter(event => {
    if (event.status !== 'skipped') return false;
    const dayKey = dateKeyFromDate(new Date(event.start_at), timeZone);
    return dayKey >= shiftDateKey(todayKey, -6) && dayKey <= todayKey;
  }).length;

  const uniqueRecentSessionIds = Array.from(new Set(recentSessionIds));
  const [instances, summaryRows, logRows] = await Promise.all([
    listLatestInstanceRows(uniqueRecentSessionIds),
    getLatestSummaryRows(latestSession ? [latestSession.id] : []),
    uniqueRecentSessionIds.length
      ? supabase
        .from('trainer_workout_logs')
        .select('session_id, log_json')
        .in('session_id', uniqueRecentSessionIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  throwIfSupabaseError(logRows.error, 'trainer_workout_logs');

  const logsBySession = new Map((logRows.data || []).map(row => [row.session_id, row.log_json || {}]));
  const summaryBySession = new Map((summaryRows || []).map(row => [row.session_id, row.summary_json || {}]));

  let currentTotalVolume = 0;
  let previousTotalVolume = 0;
  let currentPushVolume = 0;
  let previousPushVolume = 0;
  let currentPullVolume = 0;
  let previousPullVolume = 0;
  let currentLowerVolume = 0;
  let previousLowerVolume = 0;
  let currentRpeSum = 0;
  let currentRpeCount = 0;
  let previousRpeSum = 0;
  let previousRpeCount = 0;

  for (const row of instances) {
    const dayKey = dayKeyBySession.get(row.session_id);
    if (!dayKey || dayKey < previous30Start) continue;
    const isCurrentWindow = dayKey >= last30Start;
    const exercises = Array.isArray(row?.instance_json?.exercises) ? row.instance_json.exercises : [];

    let sessionTotal = 0;
    let sessionPush = 0;
    let sessionPull = 0;
    let sessionLower = 0;

    for (const exercise of exercises) {
      const tracking = exercise?._tracking && typeof exercise._tracking === 'object'
        ? exercise._tracking
        : {};
      const volume = safeNumber(tracking.volume) || 0;
      sessionTotal += volume;
      sessionPush += safeNumber(parsePushVolumeFromExercise(exercise)) || 0;
      sessionPull += safeNumber(parsePullVolumeFromExercise(exercise)) || 0;
      sessionLower += safeNumber(parseLowerVolumeFromExercise(exercise)) || 0;
    }

    if (isCurrentWindow) {
      currentTotalVolume += sessionTotal;
      currentPushVolume += sessionPush;
      currentPullVolume += sessionPull;
      currentLowerVolume += sessionLower;
    } else {
      previousTotalVolume += sessionTotal;
      previousPushVolume += sessionPush;
      previousPullVolume += sessionPull;
      previousLowerVolume += sessionLower;
    }

    const log = logsBySession.get(row.session_id) || {};
    const rpe = safeNumber(log?.reflection?.rpe);
    if (rpe !== null) {
      if (isCurrentWindow) {
        currentRpeSum += rpe;
        currentRpeCount += 1;
      } else {
        previousRpeSum += rpe;
        previousRpeCount += 1;
      }
    }
  }

  const pctDelta = (current, previous) => {
    if (!Number.isFinite(previous) || previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  };

  const avg = values => values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : null;
  const avgDurationCurrent = avg(durationsCurrent);
  const avgDurationPrevious = avg(durationsPrevious);
  const avgRpeCurrent = currentRpeCount > 0 ? currentRpeSum / currentRpeCount : null;
  const avgRpePrevious = previousRpeCount > 0 ? previousRpeSum / previousRpeCount : null;

  let plannedToday = null;
  let nextScheduled = null;
  for (const event of scheduledEvents) {
    const eventDayKey = dateKeyFromDate(new Date(event.start_at), timeZone);
    if (!plannedToday && eventDayKey === todayKey) {
      plannedToday = event;
    }
    if (!nextScheduled && eventDayKey >= todayKey) {
      nextScheduled = event;
    }
  }

  const goalRow = goalResult.data?.[0] || null;
  const goalJson = goalRow?.contract_json || {};
  const goalsSummary = safeString(goalJson?.primary_goal || goalJson?.goal || goalJson?.summary);
  const primaryLocation = locationResult.data?.[0] || null;
  const memoryFacts = getMemoryFacts(memoryResult.data || []);

  const lastSummary = latestSession ? (summaryBySession.get(latestSession.id) || {}) : {};
  const lastWins = Array.isArray(lastSummary?.wins)
    ? lastSummary.wins.filter(item => typeof item === 'string' && item.trim()).slice(0, 2)
    : [];
  const lastSessionDayKey = latestSession
    ? dateKeyFromDate(new Date(latestSession.completed_at || latestSession.started_at), timeZone)
    : null;
  const daysSinceLastWorkout = lastSessionDayKey
    ? Math.max(0, Math.round((new Date(`${todayKey}T00:00:00Z`) - new Date(`${lastSessionDayKey}T00:00:00Z`)) / 86400000))
    : null;

  const latestCheckin = checkinResult.data?.[0] || null;
  const checkinSummaryText = safeString(latestCheckin?.summary_json?.focus || latestCheckin?.summary_json?.summary || null);

  const rawAdherenceRate = plannedWeek > 0 ? Math.round((weeklyWorkouts / plannedWeek) * 100) : null;
  const adherenceRate = rawAdherenceRate === null
    ? null
    : Math.max(0, Math.min(100, rawAdherenceRate));
  const context = {
    profile_snapshot: {
      first_name: safeString(profileResult.data?.first_name),
      goals_summary: goalsSummary,
      coaching_style: null,
      equipment_summary: getLocationEquipmentSummary(primaryLocation),
      primary_location_name: safeString(primaryLocation?.name)
    },
    today_context: {
      local_date: todayKey,
      time_zone: timeZone,
      day_of_week: toDayOfWeek(todayKey),
      planned_workout_today: {
        exists: Boolean(plannedToday),
        title: safeString(plannedToday?.title),
        focus: safeString(plannedToday?.title || plannedToday?.notes),
        duration_min: null,
        notes: safeString(plannedToday?.notes)
      },
      next_scheduled_workout: nextScheduled ? {
        start_at: nextScheduled.start_at,
        title: safeString(nextScheduled.title),
        focus: safeString(nextScheduled.title || nextScheduled.notes),
        duration_min: null
      } : null
    },
    recent_adherence: {
      workouts_completed_week: weeklyWorkouts,
      workouts_planned_week: plannedWeek,
      adherence_rate_pct: adherenceRate,
      streak_days: streakDays,
      skipped_last_7d: skippedLast7d
    },
    performance_trends: {
      volume_30d_delta_pct: pctDelta(currentTotalVolume, previousTotalVolume),
      session_count_30d_delta_pct: pctDelta(currentSessionCount, previousSessionCount),
      avg_duration_30d_delta_min: (avgDurationCurrent !== null && avgDurationPrevious !== null)
        ? Math.round((avgDurationCurrent - avgDurationPrevious) * 10) / 10
        : null,
      avg_rpe_30d_delta: (avgRpeCurrent !== null && avgRpePrevious !== null)
        ? Math.round((avgRpeCurrent - avgRpePrevious) * 10) / 10
        : null,
      split_volume_delta_pct: {
        push: pctDelta(currentPushVolume, previousPushVolume),
        pull: pctDelta(currentPullVolume, previousPullVolume),
        lower: pctDelta(currentLowerVolume, previousLowerVolume)
      }
    },
    last_session_summary: {
      started_at: latestSession?.started_at || null,
      title: safeString(lastSummary?.title),
      focus: safeString(lastSummary?.next_session_focus),
      wins: lastWins,
      pain_flags_count: safeNumber(lastSummary?.pain_flags),
      completion_quality: latestSession
        ? (latestSession.status === 'completed' ? 'completed' : 'stopped_early')
        : 'unknown',
      unfinished_sets_total: safeNumber(lastSummary?.unfinished_sets_total)
    },
    progress_signals: {
      measurement_changes: [],
      prs: []
    },
    continuity_memory: {
      stable_facts: memoryFacts,
      sentiment_cue: checkinSummaryText
    },
    safety_and_recovery: {
      soreness_trend: 'unknown',
      pain_trend: 'unknown',
      days_since_last_workout: daysSinceLastWorkout
    },
    engagement_context: {
      days_since_last_open: null,
      days_since_last_workout_start: daysSinceLastWorkout,
      returning_after_gap: daysSinceLastWorkout !== null ? daysSinceLastWorkout >= 7 : false
    }
  };

  const parsedContext = dailyMessageLlmContextSchema.parse(context);

  return {
    context: parsedContext,
    summary_stats: {
      weekly_workouts: weeklyWorkouts,
      streak_days: streakDays,
      adherence_rate_pct: adherenceRate,
      planned_workouts_week: plannedWeek,
      current_push_volume: Math.round(currentPushVolume),
      previous_push_volume: Math.round(previousPushVolume)
    }
  };
}

function buildDailyMessageText(stats = {}) {
  const parts = [];

  parts.push(`You've completed **${stats.weekly_workouts || 0} workouts** this week.`);

  if ((stats.streak_days || 0) > 0) {
    parts.push(`Day **${stats.streak_days}** of your streak.`);
  } else {
    parts.push('Build momentum with a workout today.');
  }

  const pushTrend = Number(stats.push_strength_trend_percent);
  if (Number.isFinite(pushTrend)) {
    if (pushTrend > 0) {
      parts.push(`Push strength trend is **up ${pushTrend}%** over the previous 30 days.`);
    } else if (pushTrend < 0) {
      parts.push(`Push strength trend is **down ${Math.abs(pushTrend)}%** over the previous 30 days.`);
    } else {
      parts.push('Push strength trend is **steady** over the previous 30 days.');
    }
  } else if ((stats.current_push_volume || 0) > 0) {
    parts.push(`You've logged **${Math.round(stats.current_push_volume)}** push-volume units this month.`);
  }

  if (stats.today_focus) {
    parts.push(`Today's focus: **${stats.today_focus}**.`);
  } else {
    parts.push("Let's keep building.");
  }

  return parts.join(' ');
}

function formatDailyMessageForClient(row) {
  return {
    id: row.id,
    message_date: row.message_date,
    time_zone: row.time_zone || DAILY_MESSAGE_FALLBACK_TIMEZONE,
    message_text: row.message_text || 'Welcome back! Let\'s train today.',
    stats: row.stats_json || {},
    created_at: row.created_at
  };
}

function shouldReuseExistingDailyMessage(row) {
  const source = row?.stats_json?.generation?.source;
  return source === 'llm' || source === 'fallback';
}

async function getOrCreateDailyMessage({ userId, timeZone }) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const todayKey = dateKeyFromDate(new Date(), normalizedTimeZone);
  console.log('[daily-message] service start', {
    user_id: userId,
    requested_timezone: timeZone || null,
    normalized_timezone: normalizedTimeZone,
    message_date: todayKey
  });

  const { data: existingRow, error: existingError } = await supabase
    .from('trainer_daily_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('message_date', todayKey)
    .maybeSingle();
  throwIfSupabaseError(existingError, 'trainer_daily_messages');

  if (existingRow && shouldReuseExistingDailyMessage(existingRow)) {
    console.log('[daily-message] cache hit', {
      user_id: userId,
      message_date: todayKey,
      source: existingRow?.stats_json?.generation?.source || 'unknown',
      model: existingRow?.stats_json?.generation?.model || null,
      message_text: existingRow?.message_text || null
    });
    return formatDailyMessageForClient(existingRow);
  }

  const { context, summary_stats: summaryStats } = await computeDailyMessageContext({
    userId,
    timeZone: normalizedTimeZone,
    todayKey
  });

  let messageText = null;
  let modelUsed = null;
  try {
    const generated = await generateDailyMessageWithLlm(context);
    messageText = generated.message_text;
    modelUsed = generated.model;
    console.log('[daily-message] llm generated', {
      user_id: userId,
      message_date: todayKey,
      model: modelUsed,
      message_text: messageText
    });
  } catch (error) {
    console.error('Daily message LLM generation failed, using fallback:', {
      message: error?.message
    });
    messageText = buildFallbackDailyMessage(context);
    console.log('[daily-message] fallback generated', {
      user_id: userId,
      message_date: todayKey,
      message_text: messageText
    });
  }

  if (!messageText) {
    messageText = buildDailyMessageText(summaryStats);
  }

  const insertPayload = {
    user_id: userId,
    message_date: todayKey,
    time_zone: normalizedTimeZone,
    message_text: messageText,
    stats_json: {
      ...summaryStats,
      context,
      generation: {
        source: modelUsed ? 'llm' : 'fallback',
        model: modelUsed
      }
    }
  };

  let insertedRow = null;
  let insertError = null;

  if (existingRow) {
    const updateResult = await supabase
      .from('trainer_daily_messages')
      .update(insertPayload)
      .eq('id', existingRow.id)
      .select('*')
      .maybeSingle();
    insertedRow = updateResult.data;
    insertError = updateResult.error;
  } else {
    const insertResult = await supabase
      .from('trainer_daily_messages')
      .insert(insertPayload)
      .select('*')
      .maybeSingle();
    insertedRow = insertResult.data;
    insertError = insertResult.error;
  }

  if (insertError) {
    const isUniqueViolation = String(insertError.code || '') === '23505';
    if (!isUniqueViolation) {
      throwIfSupabaseError(insertError, 'trainer_daily_messages');
    } else {
      const { data: raceWinnerRow, error: raceWinnerError } = await supabase
        .from('trainer_daily_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('message_date', todayKey)
        .maybeSingle();
      throwIfSupabaseError(raceWinnerError, 'trainer_daily_messages');
      if (raceWinnerRow) return formatDailyMessageForClient(raceWinnerRow);
    }
  }

  if (!insertedRow) {
    const fallbackError = new Error('Failed to create daily message');
    fallbackError.statusCode = 500;
    throw fallbackError;
  }

  console.log('[daily-message] persisted', {
    user_id: userId,
    message_date: todayKey,
    source: insertedRow?.stats_json?.generation?.source || (modelUsed ? 'llm' : 'fallback'),
    model: insertedRow?.stats_json?.generation?.model || modelUsed || null,
    message_text: insertedRow?.message_text || messageText
  });

  return formatDailyMessageForClient(insertedRow);
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
  listHistory,
  getOrCreateDailyMessage
};
