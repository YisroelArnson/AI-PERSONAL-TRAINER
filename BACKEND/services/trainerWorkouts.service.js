const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { fetchMultipleDataSources } = require('./dataSources.service');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

const EVENT_TYPES = {
  sessionStarted: 'session_started',
  instanceGenerated: 'instance_generated',
  action: 'action',
  logSet: 'log_set',
  logInterval: 'log_interval',
  timer: 'timer',
  coachMessage: 'coach_message',
  safetyFlag: 'safety_flag',
  sessionCompleted: 'session_completed',
  error: 'error'
};

function nowIso() {
  return new Date().toISOString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function findTodayWorkoutEvent(userId) {
  const start = startOfDay(new Date());
  const end = addDays(start, 1);
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .select('id, linked_planned_session_id')
    .eq('user_id', userId)
    .eq('event_type', 'workout')
    .eq('status', 'scheduled')
    .gte('start_at', start.toISOString())
    .lt('start_at', end.toISOString())
    .order('start_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getActiveSession(userId) {
  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createSession(userId, metadata = {}) {
  const todayEvent = await findTodayWorkoutEvent(userId);
  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .insert({
      user_id: userId,
      status: 'in_progress',
      coach_mode: metadata.coach_mode || 'quiet',
      planned_session_id: todayEvent?.linked_planned_session_id || null,
      calendar_event_id: todayEvent?.id || null,
      metadata: {
        ...metadata,
        planned_session_id: todayEvent?.linked_planned_session_id || null,
        calendar_event_id: todayEvent?.id || null
      }
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateSession(userId, options = {}) {
  const { forceNew = false, metadata = {} } = options;

  if (!forceNew) {
    const active = await getActiveSession(userId);
    if (active) return active;
  }

  return createSession(userId, metadata);
}

async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

async function updateSession(sessionId, updates) {
  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .update({
      ...updates,
      updated_at: nowIso()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getNextSequence(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const last = data?.sequence_number || 0;
  return last + 1;
}

async function logEvent(sessionId, eventType, data) {
  const sequence = await getNextSequence(sessionId);
  const { data: event, error } = await supabase
    .from('trainer_workout_events')
    .insert({
      session_id: sessionId,
      sequence_number: sequence,
      event_type: eventType,
      data
    })
    .select()
    .single();

  if (error) throw error;
  return event;
}

async function createWorkoutInstance(sessionId, instanceJson) {
  const { data: existing, error: fetchError } = await supabase
    .from('trainer_workout_instances')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const version = (existing?.version || 0) + 1;

  const { data, error } = await supabase
    .from('trainer_workout_instances')
    .insert({
      session_id: sessionId,
      version,
      instance_json: instanceJson
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getLatestInstance(sessionId) {
  const { data, error } = await supabase
    .from('trainer_workout_instances')
    .select('*')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function saveWorkoutLog(sessionId, logJson) {
  const { data, error } = await supabase
    .from('trainer_workout_logs')
    .upsert({
      session_id: sessionId,
      log_json: logJson,
      created_at: nowIso()
    }, { onConflict: 'session_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function saveSessionSummary(sessionId, summaryJson) {
  const { data: existing, error: fetchError } = await supabase
    .from('trainer_session_summaries')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  const version = (existing?.version || 0) + 1;

  const { data, error } = await supabase
    .from('trainer_session_summaries')
    .insert({
      session_id: sessionId,
      version,
      summary_json: summaryJson
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function fetchEventsAfter(sessionId, sequenceNumber) {
  const { data, error } = await supabase
    .from('trainer_workout_events')
    .select('*')
    .eq('session_id', sessionId)
    .gt('sequence_number', sequenceNumber)
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

function buildUserContextSummary(dataSourceResults) {
  // Convert array of results to a keyed map for easy access
  const dataMap = {};
  for (const result of dataSourceResults) {
    dataMap[result.source] = result.raw;
  }

  const lines = [];
  if (dataMap.user_profile) {
    const stats = dataMap.user_profile;
    lines.push(`Body stats: sex=${stats.sex || 'unknown'}, height_cm=${stats.height_cm || 'unknown'}, weight_kg=${stats.weight_kg || 'unknown'}.`);
  }
  if (dataMap.all_locations?.length) {
    const current = dataMap.all_locations.find(loc => loc.current_location) || dataMap.all_locations[0];
    if (current) {
      const equipment = (current.equipment || []).map(eq => typeof eq === 'string' ? eq : eq.name).join(', ');
      lines.push(`Current location: ${current.name}. Equipment: ${equipment || 'none listed'}.`);
    }
  }
  if (dataMap.workout_history?.length) {
    const history = dataMap.workout_history.slice(0, 3).map(item => item.exercises?.map(e => e.name).join(', ') || 'workout').join('; ');
    lines.push(`Recent workouts: ${history}.`);
  }
  if (dataMap.user_settings) {
    lines.push(`Units: weight=${dataMap.user_settings.weight_unit || 'lbs'}, distance=${dataMap.user_settings.distance_unit || 'miles'}.`);
  }
  return lines.join('\n');
}

function buildWorkoutPrompt(dataSourceResults, constraints) {
  const context = buildUserContextSummary(dataSourceResults);
  const readiness = constraints?.readiness || {};
  const timeAvailable = constraints?.time_available_min || null;
  const equipment = constraints?.equipment || [];
  const requestText = constraints?.request_text || null;
  const plannedSession = constraints?.planned_session || null;

  return `You are an AI personal trainer. Create a safe, effective workout for today using the 4-type exercise system.

User context:
${context}

Session constraints:
- intent: ${constraints?.intent || 'planned'}
- time_available_min: ${timeAvailable || 'unknown'}
- energy: ${readiness.energy || 'unknown'}
- soreness: ${readiness.soreness || 'unknown'}
- pain: ${readiness.pain || 'none'}
- equipment_override: ${equipment.length ? equipment.join(', ') : 'none'}
- quick_request: ${requestText || 'none'}
- planned_session_intent: ${plannedSession ? JSON.stringify(plannedSession) : 'none'}

Return ONLY valid JSON with this shape:
{
  "title": "string",
  "estimated_duration_min": number,
  "focus": ["string"],
  "exercises": [
    {
      "exercise_name": "string",
      "exercise_type": "reps|hold|duration|intervals",
      "muscles_utilized": [{"muscle": "string", "share": number}],
      "goals_addressed": [{"goal": "string", "share": number}],
      "reasoning": "string",
      "exercise_description": "string",
      "equipment": ["string"],
      "sets": number,
      "reps": [number],
      "load_kg_each": [number],
      "load_unit": "kg|lbs",
      "hold_duration_sec": [number],
      "duration_min": number,
      "distance_km": number,
      "distance_unit": "km|mi",
      "rounds": number,
      "work_sec": number,
      "rest_seconds": number
    }
  ]
}
Ensure exercises align with equipment, constraints, and safety. Use conservative prescriptions if data is unknown.`;
}

function extractJson(text) {
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  const jsonString = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return null;
  }
}

function normalizeExercise(exercise) {
  const type = exercise.exercise_type || exercise.type;
  return {
    exercise_name: exercise.exercise_name || exercise.name,
    exercise_type: type,
    muscles_utilized: exercise.muscles_utilized || [],
    goals_addressed: exercise.goals_addressed || [],
    reasoning: exercise.reasoning || '',
    exercise_description: exercise.exercise_description || null,
    equipment: exercise.equipment || [],
    sets: exercise.sets || null,
    reps: exercise.reps || null,
    load_kg_each: exercise.load_kg_each || exercise.load_each || null,
    load_unit: exercise.load_unit || null,
    hold_duration_sec: exercise.hold_duration_sec || exercise.hold_sec || null,
    duration_min: exercise.duration_min || null,
    distance_km: exercise.distance_km || exercise.distance || null,
    distance_unit: exercise.distance_unit || null,
    rounds: exercise.rounds || null,
    work_sec: exercise.work_sec || null,
    rest_seconds: exercise.rest_seconds || exercise.rest_sec || null
  };
}

function normalizeWorkoutInstance(rawInstance, constraints = {}) {
  const exercises = Array.isArray(rawInstance.exercises)
    ? rawInstance.exercises.map(normalizeExercise)
    : [];

  return {
    title: rawInstance.title || 'Today\'s Workout',
    estimated_duration_min: rawInstance.estimated_duration_min || rawInstance.duration_min || null,
    focus: rawInstance.focus || [],
    exercises,
    metadata: {
      intent: constraints.intent || 'planned',
      request_text: constraints.request_text || null,
      planned_session: constraints.planned_session || null,
      generated_at: nowIso()
    }
  };
}

async function generateWorkoutInstance(userId, constraints = {}) {
  const dataSourceResults = await fetchMultipleDataSources(
    ['user_profile', 'user_settings', 'all_locations', 'workout_history'],
    userId
  );
  const prompt = buildWorkoutPrompt(dataSourceResults, constraints);
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    system: [
      { type: 'text', text: 'You are a concise JSON-only generator.' }
    ],
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');

  if (!parsed || !parsed.exercises) {
    throw new Error('Failed to parse workout instance from model response');
  }

  return normalizeWorkoutInstance(parsed, constraints);
}

function adjustExerciseIntensity(exercise, direction) {
  const multiplier = direction === 'harder' ? 1.15 : 0.85;
  const adjustSets = (sets) => {
    if (!sets) return sets;
    if (direction === 'harder') return Math.min(sets + 1, sets + 2);
    return Math.max(1, sets - 1);
  };

  const adjustArray = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.map(value => Math.max(1, Math.round(value * multiplier)));
  };

  return {
    ...exercise,
    sets: adjustSets(exercise.sets),
    reps: adjustArray(exercise.reps),
    hold_duration_sec: adjustArray(exercise.hold_duration_sec),
    duration_min: exercise.duration_min ? Math.max(5, Math.round(exercise.duration_min * multiplier)) : exercise.duration_min,
    rounds: exercise.rounds ? Math.max(1, Math.round(exercise.rounds * multiplier)) : exercise.rounds,
    work_sec: exercise.work_sec ? Math.max(10, Math.round(exercise.work_sec * multiplier)) : exercise.work_sec
  };
}

function scaleWorkoutInstance(instance, scaleRatio) {
  const scaledExercises = instance.exercises.map(exercise => ({
    ...exercise,
    sets: exercise.sets ? Math.max(1, Math.round(exercise.sets * scaleRatio)) : exercise.sets,
    reps: Array.isArray(exercise.reps) ? exercise.reps.map(rep => Math.max(1, Math.round(rep * scaleRatio))) : exercise.reps,
    hold_duration_sec: Array.isArray(exercise.hold_duration_sec) ? exercise.hold_duration_sec.map(sec => Math.max(10, Math.round(sec * scaleRatio))) : exercise.hold_duration_sec,
    duration_min: exercise.duration_min ? Math.max(5, Math.round(exercise.duration_min * scaleRatio)) : exercise.duration_min,
    rounds: exercise.rounds ? Math.max(1, Math.round(exercise.rounds * scaleRatio)) : exercise.rounds,
    work_sec: exercise.work_sec ? Math.max(10, Math.round(exercise.work_sec * scaleRatio)) : exercise.work_sec
  }));

  return {
    ...instance,
    estimated_duration_min: instance.estimated_duration_min ? Math.max(10, Math.round(instance.estimated_duration_min * scaleRatio)) : instance.estimated_duration_min,
    exercises: scaledExercises
  };
}

function estimateWorkoutDuration(instance) {
  if (!instance?.exercises?.length) return 30;
  let totalSeconds = 0;
  for (const exercise of instance.exercises) {
    const type = exercise.exercise_type || exercise.type;
    if (type === 'duration' && exercise.duration_min) {
      totalSeconds += exercise.duration_min * 60;
      continue;
    }
    if (type === 'intervals' && exercise.rounds && exercise.work_sec) {
      const rest = exercise.rest_seconds || 30;
      totalSeconds += exercise.rounds * (exercise.work_sec + rest);
      continue;
    }
    if ((type === 'reps' || type === 'hold') && exercise.sets) {
      const rest = exercise.rest_seconds || 45;
      const work = type === 'hold' ? 40 : 30;
      totalSeconds += exercise.sets * (rest + work);
      continue;
    }
    totalSeconds += 120;
  }
  return Math.max(10, Math.round(totalSeconds / 60));
}

async function generateSwapExercise(userId, currentExercise, constraints = {}) {
  const dataSourceResults = await fetchMultipleDataSources(
    ['user_profile', 'user_settings', 'all_locations', 'workout_history'],
    userId
  );
  const context = buildUserContextSummary(dataSourceResults);
  const client = getAnthropicClient();
  const prompt = `Suggest a safe alternative exercise to replace: ${currentExercise.exercise_name}.
Current exercise details: ${JSON.stringify(currentExercise)}
Constraints: equipment=${(constraints.equipment || []).join(', ')}, pain=${constraints.pain || 'none'}.

Return ONLY JSON:
{"exercise": {"exercise_name": "string", "exercise_type": "reps|hold|duration|intervals", "muscles_utilized": [{"muscle": "string", "share": number}], "goals_addressed": [{"goal": "string", "share": number}], "reasoning": "string", "exercise_description": "string", "equipment": ["string"], "sets": number, "reps": [number], "load_kg_each": [number], "load_unit": "kg|lbs", "hold_duration_sec": [number], "duration_min": number, "distance_km": number, "distance_unit": "km|mi", "rounds": number, "work_sec": number, "rest_seconds": number}}

User context:
${context}`;

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed?.exercise) {
    throw new Error('Failed to parse swap exercise');
  }
  return normalizeExercise(parsed.exercise);
}

async function applyAction({ sessionId, userId, actionType, payload }) {
  const latestInstance = await getLatestInstance(sessionId);
  const instanceJson = latestInstance?.instance_json;

  let updatedInstance = instanceJson;
  let instanceUpdated = false;
  let eventType = EVENT_TYPES.action;

  if (actionType === 'log_set_result') eventType = EVENT_TYPES.logSet;
  if (actionType === 'log_interval_result') eventType = EVENT_TYPES.logInterval;
  if (actionType === 'set_timer' || actionType === 'cancel_timer') eventType = EVENT_TYPES.timer;

  switch (actionType) {
    case 'swap_exercise': {
      if (!instanceJson) break;
      const index = payload?.index ?? null;
      if (index === null || index < 0 || index >= instanceJson.exercises.length) {
        throw new Error('Invalid exercise index');
      }
      const current = instanceJson.exercises[index];
      const replacement = await generateSwapExercise(userId, current, payload || {});
      const nextExercises = [...instanceJson.exercises];
      nextExercises[index] = replacement;
      updatedInstance = { ...instanceJson, exercises: nextExercises };
      instanceUpdated = true;
      break;
    }
    case 'adjust_prescription': {
      if (!instanceJson) break;
      const index = payload?.index ?? null;
      const direction = payload?.direction || 'easier';
      if (index === null || index < 0 || index >= instanceJson.exercises.length) {
        throw new Error('Invalid exercise index');
      }
      const current = instanceJson.exercises[index];
      const adjusted = adjustExerciseIntensity(current, direction);
      const nextExercises = [...instanceJson.exercises];
      nextExercises[index] = adjusted;
      updatedInstance = { ...instanceJson, exercises: nextExercises };
      instanceUpdated = true;
      break;
    }
    case 'time_scale': {
      if (!instanceJson) break;
      const target = payload?.target_minutes || null;
      if (!target) {
        throw new Error('Time scale requires target_minutes');
      }
      const baseDuration = instanceJson.estimated_duration_min || estimateWorkoutDuration(instanceJson);
      const ratio = Math.min(1, Math.max(0.4, target / baseDuration));
      const withEstimate = { ...instanceJson, estimated_duration_min: baseDuration };
      updatedInstance = scaleWorkoutInstance(withEstimate, ratio);
      instanceUpdated = true;
      break;
    }
    case 'flag_pain': {
      if (!instanceJson) break;
      const ratio = 0.8;
      updatedInstance = scaleWorkoutInstance(instanceJson, ratio);
      instanceUpdated = true;
      break;
    }
    case 'set_coach_mode': {
      const mode = payload?.mode || 'quiet';
      await updateSession(sessionId, { coach_mode: mode });
      break;
    }
    default:
      break;
  }

  await logEvent(sessionId, eventType, {
    action_type: actionType,
    payload,
    timestamp: nowIso()
  });

  if (actionType === 'flag_pain') {
    await logEvent(sessionId, EVENT_TYPES.safetyFlag, {
      payload,
      timestamp: nowIso()
    });
  }

  if (instanceUpdated) {
    const instanceRecord = await createWorkoutInstance(sessionId, updatedInstance);
    await updateSession(sessionId, {});
    return { instanceUpdated: true, instance: instanceRecord.instance_json, instanceVersion: instanceRecord.version };
  }

  await updateSession(sessionId, {});
  return { instanceUpdated: false, instance: latestInstance?.instance_json, instanceVersion: latestInstance?.version || null };
}

async function generateSessionSummary({ sessionId, instance, log, reflection }) {
  const client = getAnthropicClient();
  const prompt = `Summarize this workout session. Return JSON only.

Workout instance: ${JSON.stringify(instance)}
Workout log: ${JSON.stringify(log)}
Reflection: ${JSON.stringify(reflection)}

Return JSON:
{
  "title": "string",
  "completion": {"exercises": number, "total_sets": number},
  "overall_rpe": number,
  "pain_notes": "string",
  "wins": ["string"],
  "next_session_focus": "string"
}`;

  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      system: [{ type: 'text', text: 'Return JSON only.' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const parsed = extractJson(textBlock?.text || '');
    if (parsed) return parsed;
  } catch (error) {
    // fall through to fallback
  }

  return {
    title: 'Workout complete',
    completion: {
      exercises: instance?.exercises?.length || 0,
      total_sets: log?.setsCompleted || 0
    },
    overall_rpe: reflection?.rpe || null,
    pain_notes: reflection?.pain || '',
    wins: ['Nice work showing up today.'],
    next_session_focus: 'Recover well and be ready for the next session.'
  };
}

module.exports = {
  EVENT_TYPES,
  getActiveSession,
  getOrCreateSession,
  getSession,
  updateSession,
  logEvent,
  createWorkoutInstance,
  getLatestInstance,
  generateWorkoutInstance,
  applyAction,
  saveWorkoutLog,
  saveSessionSummary,
  generateSessionSummary,
  fetchEventsAfter
};
