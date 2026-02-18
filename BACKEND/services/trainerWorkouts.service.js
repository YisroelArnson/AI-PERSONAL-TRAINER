const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { fetchMultipleDataSources } = require('./dataSources.service');
const { getAnthropicClient } = require('./modelProviders.service');
const { getActiveProgram } = require('./trainerProgram.service');
const { getLatestProfile, formatProfileForPrompt } = require('./trainerWeightsProfile.service');

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

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
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

async function createSession(userId, metadata = {}, explicitLinks = {}) {
  const hasExplicitLinks = Boolean(explicitLinks.calendarEventId || explicitLinks.plannedSessionId);
  const todayEvent = hasExplicitLinks ? null : await findTodayWorkoutEvent(userId);
  let resolvedCalendarEventId = explicitLinks.calendarEventId || todayEvent?.id || null;
  let resolvedPlannedSessionId = explicitLinks.plannedSessionId || todayEvent?.linked_planned_session_id || null;
  let explicitEvent = null;
  let explicitPlan = null;

  if (hasExplicitLinks && resolvedCalendarEventId) {
    const { data: linkedEvent, error: linkedEventError } = await supabase
      .from('trainer_calendar_events')
      .select('id, linked_planned_session_id')
      .eq('id', resolvedCalendarEventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (linkedEventError) throw linkedEventError;
    if (!linkedEvent) {
      throw new Error('calendar_event_id not found');
    }
    explicitEvent = linkedEvent;
    if (!resolvedPlannedSessionId) {
      resolvedPlannedSessionId = linkedEvent.linked_planned_session_id || null;
    }
  }

  if (hasExplicitLinks && resolvedPlannedSessionId) {
    const { data: linkedPlan, error: linkedPlanError } = await supabase
      .from('trainer_planned_sessions')
      .select('id, calendar_event_id')
      .eq('id', resolvedPlannedSessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (linkedPlanError) throw linkedPlanError;
    if (!linkedPlan) {
      throw new Error('planned_session_id not found');
    }
    explicitPlan = linkedPlan;
    if (!resolvedCalendarEventId) {
      resolvedCalendarEventId = linkedPlan.calendar_event_id || null;
    }
  }

  if (
    hasExplicitLinks &&
    explicitEvent?.linked_planned_session_id &&
    explicitPlan?.id &&
    explicitEvent.linked_planned_session_id !== explicitPlan.id
  ) {
    throw new Error('calendar_event_id and planned_session_id do not match');
  }

  if (
    hasExplicitLinks &&
    explicitPlan?.calendar_event_id &&
    explicitEvent?.id &&
    explicitPlan.calendar_event_id !== explicitEvent.id
  ) {
    throw new Error('calendar_event_id and planned_session_id do not match');
  }

  const { data, error } = await supabase
    .from('trainer_workout_sessions')
    .insert({
      user_id: userId,
      status: 'in_progress',
      coach_mode: metadata.coach_mode || 'quiet',
      planned_session_id: resolvedPlannedSessionId,
      calendar_event_id: resolvedCalendarEventId,
      metadata: {
        ...metadata,
        planned_session_id: resolvedPlannedSessionId,
        calendar_event_id: resolvedCalendarEventId
      }
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateSession(userId, options = {}) {
  const {
    forceNew = false,
    metadata = {},
    calendarEventId = null,
    plannedSessionId = null
  } = options;

  if (!forceNew) {
    const active = await getActiveSession(userId);
    if (active) return active;
  }

  return createSession(userId, metadata, { calendarEventId, plannedSessionId });
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
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

    if (!error) {
      return event;
    }

    if (error.code === '23505') {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      continue;
    }

    throw error;
  }

  throw lastError;
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

function buildWorkoutPrompt(dataSourceResults, constraints, program, weightsProfile = null) {
  const context = buildUserContextSummary(dataSourceResults);

  const timeAvailable = constraints?.time_available_min || 'unknown';
  const equipment = constraints?.equipment || [];
  const intent = constraints?.intent || 'planned';
  const requestText = constraints?.request_text || null;
  const plannedSession = constraints?.planned_session || null;
  const plannedIntentOriginal = constraints?.planned_intent_original || null;
  const plannedIntentEdited = constraints?.planned_intent_edited || null;

  let prompt = `You are an AI personal trainer. Create a safe, effective workout for today using the 4-type exercise system.

User context:
${context}
`;

  if (program?.program_markdown) {
    prompt += `
Active Training Program:
${program.program_markdown}
`;
  }

  const weightsText = formatProfileForPrompt(weightsProfile);
  if (weightsText) {
    prompt += `
Current Weights Profile (use these loads when prescribing exercises):
${weightsText}
`;
  }

  prompt += `
Pre-Workout Context:
- Time Available: ${timeAvailable} minutes
- Available Equipment: ${equipment.length ? equipment.join(', ') : 'use equipment from user context'}
- Session Intent: ${intent}`;

  if (requestText) {
    prompt += `\n- User Request: ${requestText}`;
  }
  if (plannedSession) {
    prompt += `\n- Planned Session: ${JSON.stringify(plannedSession)}`;
  }
  if (plannedIntentOriginal) {
    prompt += `\n- Original Planned Intent: ${JSON.stringify(plannedIntentOriginal)}`;
  }
  if (plannedIntentEdited) {
    prompt += `\n- User Modified Intent: ${JSON.stringify(plannedIntentEdited)}`;
  }

  prompt += `

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
      "load_each": [number],
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
IMPORTANT weight rules:
- Always use the user's preferred weight unit (shown in Units above). Do NOT convert between kg and lbs.
- Round weights to practical increments: nearest 5 lbs (or 2.5 kg). For dumbbells, round to nearest 5 lbs (or 2.5 kg).
- load_each values must be whole numbers or simple halves (e.g. 25, 30, 42.5), never odd decimals like 11.3 or 9.1.
- load_each is an array with one value per set. Use different values when programming progressive sets (e.g. [135, 155, 175] for a pyramid). Use the same value repeated when sets are uniform (e.g. [25, 25, 25]).

Ensure exercises align with the active training program's current phase, respect exercise rules and safety guidelines, match available equipment and time constraints, and use conservative prescriptions if data is unknown.`;

  return prompt;
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
    load_each: exercise.load_each || exercise.load_kg_each || null,
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
      planned_intent_original: constraints.planned_intent_original || null,
      planned_intent_edited: constraints.planned_intent_edited || null,
      generated_at: nowIso()
    }
  };
}

function buildIntentPlanPrompt(intentText, context, programMarkdown = '') {
  return `You are an AI personal trainer assistant. The user wants to plan a specific workout session.

User's training program (for context only - prioritize the user's stated intent):
${programMarkdown || 'No active program available.'}

User context:
${context || 'No additional user context available.'}

The user said: "${intentText}"

Based on their request, generate a structured session plan. Return ONLY valid JSON:
{
  "focus": "Short title for the session (e.g., 'Lower Body - Glutes & Hamstrings')",
  "notes": "1-2 sentence description of the session's intent and approach",
  "duration_min": <number>
}

Rules:
- The focus should be a clear, descriptive title
- The notes should capture the user's intent and any specific instructions
- The duration_min should match what the user requested, or default to 45 if unspecified
- Prioritize the user's specific request over the general program plan`;
}

async function generateIntentPlan(userId, intentText) {
  const [dataSourceResults, program] = await Promise.all([
    fetchMultipleDataSources(['user_profile', 'user_settings', 'all_locations'], userId),
    getActiveProgram(userId)
  ]);
  const context = buildUserContextSummary(dataSourceResults);
  const prompt = buildIntentPlanPrompt(intentText, context, program?.program_markdown);
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: [
      { type: 'text', text: 'Return ONLY valid JSON with focus, notes, and duration_min.' }
    ],
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) {
    throw new Error('Failed to parse intent plan JSON');
  }

  const duration = toIntOrNull(parsed.duration_min) ?? 45;
  return {
    focus: typeof parsed.focus === 'string' && parsed.focus.trim()
      ? parsed.focus.trim()
      : 'Custom Workout',
    notes: typeof parsed.notes === 'string' && parsed.notes.trim()
      ? parsed.notes.trim()
      : 'Custom workout based on your request.',
    duration_min: clampInt(duration, 10, 120)
  };
}

async function generateWorkoutInstance(userId, constraints = {}) {
  const [dataSourceResults, program, weightsProfile] = await Promise.all([
    fetchMultipleDataSources(
      ['user_profile', 'user_settings', 'all_locations', 'workout_history'],
      userId
    ),
    getActiveProgram(userId),
    getLatestProfile(userId)
  ]);
  const prompt = buildWorkoutPrompt(dataSourceResults, constraints, program, weightsProfile);
  console.log(`[workout-gen] Prompt length: ${prompt.length} chars, program: ${program?.program_markdown?.length || 0} chars`);
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: [
      { type: 'text', text: 'You are a concise JSON-only generator. Return ONLY valid JSON, no markdown, no explanation, no code fences.' }
    ],
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const rawText = textBlock?.text || '';
  console.log(`[workout-gen] Model response length: ${rawText.length}, stop_reason: ${response.stop_reason}, usage: input=${response.usage?.input_tokens} output=${response.usage?.output_tokens}`);

  const parsed = extractJson(rawText);

  if (!parsed || !parsed.exercises) {
    console.error('[workout-gen] Failed to parse JSON. First 1000 chars:', rawText.slice(0, 1000));
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
{"exercise": {"exercise_name": "string", "exercise_type": "reps|hold|duration|intervals", "muscles_utilized": [{"muscle": "string", "share": number}], "goals_addressed": [{"goal": "string", "share": number}], "reasoning": "string", "exercise_description": "string", "equipment": ["string"], "sets": number, "reps": [number], "load_each": [number], "load_unit": "kg|lbs", "hold_duration_sec": [number], "duration_min": number, "distance_km": number, "distance_unit": "km|mi", "rounds": number, "work_sec": number, "rest_seconds": number}}
Use the same weight unit as the original exercise. Do NOT convert between kg and lbs. Round to practical increments (nearest 5 lbs or 2.5 kg).

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
      let index = payload?.index ?? null;
      if (index === null && payload?.exercise_name) {
        index = instanceJson.exercises.findIndex(e => e.exercise_name === payload.exercise_name);
        if (index === -1) index = null;
      }
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
      let index = payload?.index ?? null;
      if (index === null && payload?.exercise_name) {
        index = instanceJson.exercises.findIndex(e => e.exercise_name === payload.exercise_name);
        if (index === -1) index = null;
      }
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
      const target = payload?.target_duration_min || null;
      if (!target) {
        throw new Error('Time scale requires target_duration_min');
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
  generateIntentPlan,
  applyAction,
  saveWorkoutLog,
  saveSessionSummary,
  generateSessionSummary,
  fetchEventsAfter,
  // Exported for testing
  extractJson,
  normalizeExercise,
  normalizeWorkoutInstance,
  buildUserContextSummary,
  buildWorkoutPrompt,
  adjustExerciseIntensity,
  scaleWorkoutInstance,
  estimateWorkoutDuration,
  generateSwapExercise,
  findTodayWorkoutEvent
};
