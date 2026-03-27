const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { parseWorkoutSessionState } = require('../schemas/workout.schema');

const LIVE_WORKOUT_STATUSES = ['queued', 'in_progress', 'paused'];
const TERMINAL_EXERCISE_STATUSES = new Set(['completed', 'skipped', 'canceled']);
const TERMINAL_SET_STATUSES = new Set(['completed', 'skipped']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function buildError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function coerceStateVersion(value) {
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function buildNextStateVersion(session) {
  return coerceStateVersion(session && session.state_version) + 1;
}

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

function normalizeExerciseName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

function isCurrentReference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'current' || normalized === 'active';
}

function normalizeReferenceToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveExerciseDefinitionId(value) {
  return isUuid(value) ? String(value).trim() : null;
}

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

function buildSessionGuidancePayload(input) {
  return {
    ...(input.guidance || {}),
    decision: input.decision || null,
    startMode: input.startMode || null
  };
}

function buildSessionSummaryPayload(input) {
  return {
    ...(input.summary || {})
  };
}

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
    currentExerciseId: currentExercise ? currentExercise.workoutExerciseId : null,
    progress: computeProgress(exerciseStates),
    exercises: exerciseStates
  });
}

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

  return data || null;
}

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

  return data || null;
}

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
    await deleteWorkoutSessionRow(graph.session.workout_session_id);
    return null;
  }

  return graph;
}

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

function findWorkoutSetRow(graph, workoutExerciseId, setIndex) {
  if (!graph || !Array.isArray(graph.sets)) {
    return null;
  }

  return graph.sets.find(row => (
    row.workout_exercise_id === workoutExerciseId &&
    row.set_index === setIndex
  )) || null;
}

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

async function getCurrentWorkoutState({ userId, sessionKey, workoutSessionId }) {
  const graph = await loadResolvedWorkoutGraph({
    userId,
    sessionKey,
    workoutSessionId
  });

  if (!graph) {
    return null;
  }

  return buildWorkoutState(graph);
}

async function createWorkoutSessionFromDraft({ userId, sessionKey, runId, input }) {
  const supabase = getAdminClientOrThrow();
  let existingLiveWorkout = await getLiveWorkoutSessionRow({
    userId
  });

  if (existingLiveWorkout) {
    const hasExercises = await workoutSessionHasExercises(existingLiveWorkout.workout_session_id);

    if (!hasExercises) {
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
      workoutSessionId: session.workout_session_id
    });
  } catch (error) {
    if (session && session.workout_session_id) {
      await deleteWorkoutSessionRow(session.workout_session_id);
    }

    throw error;
  }
}

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

function combineNotes(existingNotes, userNote) {
  const notes = [existingNotes, userNote]
    .map(value => (value ? String(value).trim() : ''))
    .filter(Boolean);

  return notes.length > 0 ? notes.join('\n') : null;
}

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

function findFirstPendingSetIndex(setRows) {
  const nextSet = setRows
    .filter(row => !TERMINAL_SET_STATUSES.has(row.status))
    .sort((left, right) => left.set_index - right.set_index)[0];

  return nextSet ? nextSet.set_index : null;
}

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
    workoutSessionId: graphAfterExerciseUpdate.session.workout_session_id
  });

  return {
    updatedSet: updatedTargetSet,
    workout: finalState
  };
}

function hasExplicitFlow(flow) {
  return Boolean(flow) && (
    flow.currentPhase != null ||
    flow.currentExerciseIndex != null ||
    flow.currentSetIndex != null
  );
}

function normalizeDraftOrderIndexes(drafts, startingOrderIndex) {
  return [...drafts]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((draft, offset) => ({
      ...draft,
      orderIndex: startingOrderIndex + offset
    }));
}

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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
      workoutSessionId: graph.session.workout_session_id
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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
      workoutSessionId: graph.session.workout_session_id
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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
      workoutSessionId: graph.session.workout_session_id
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
    workoutSessionId: graph.session.workout_session_id
  });
}

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
    workoutSessionId: graph.session.workout_session_id
  });
}

module.exports = {
  __testUtils: {
    buildExerciseKey,
    buildNextStateVersion,
    coerceStateVersion,
    findWorkoutExerciseRow,
    findWorkoutSetRow,
    isCurrentReference,
    resolveExerciseDefinitionId
  },
  LIVE_WORKOUT_STATUSES,
  adjustWorkoutSetTargets,
  createWorkoutSessionFromDraft,
  finishWorkoutSession,
  getCurrentWorkoutState,
  pauseWorkoutSession,
  recordWorkoutSetResult,
  resumeWorkoutSession,
  replaceWorkoutExerciseFromDraft,
  rewriteRemainingWorkoutFromDraft,
  skipWorkoutExercise,
  startWorkoutSession
};
