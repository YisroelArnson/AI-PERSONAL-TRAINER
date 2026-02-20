const { fetchMultipleDataSources } = require('./dataSources.service');
const { getAnthropicClient } = require('./modelProviders.service');
const { getActiveProgram } = require('./trainerProgram.service');
const { getLatestProfile, formatProfileForPrompt } = require('./trainerWeightsProfile.service');
const dotenv = require('dotenv');
const { v4: uuidv4, validate: isUuid } = require('uuid');

dotenv.config();

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function nowIso() {
  return new Date().toISOString();
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

function normalizeExercise(exercise = {}) {
  const type = exercise.exercise_type || exercise.type;
  const rawId = typeof exercise.id === 'string' ? exercise.id : null;
  return {
    id: rawId && isUuid(rawId) ? rawId : uuidv4(),
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

function normalizeWorkoutInstance(rawInstance = {}, constraints = {}) {
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

function buildUserContextSummary(dataSourceResults) {
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
      const equipment = (current.equipment || []).map(eq => (typeof eq === 'string' ? eq : eq.name)).join(', ');
      lines.push(`Current location: ${current.name}. Equipment: ${equipment || 'none listed'}.`);
    }
  }
  if (dataMap.workout_history?.length) {
    const history = dataMap.workout_history
      .slice(0, 3)
      .map(item => item.exercises?.map(e => e.name).join(', ') || 'workout')
      .join('; ');
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
    system: [{ type: 'text', text: 'Return ONLY valid JSON with focus, notes, and duration_min.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
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
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: [{
      type: 'text',
      text: 'You are a concise JSON-only generator. Return ONLY valid JSON, no markdown, no explanation, no code fences.'
    }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const rawText = textBlock?.text || '';
  const parsed = extractJson(rawText);

  if (!parsed || !parsed.exercises) {
    throw new Error('Failed to parse workout instance from model response');
  }

  return normalizeWorkoutInstance(parsed, constraints);
}

module.exports = {
  extractJson,
  normalizeExercise,
  normalizeWorkoutInstance,
  buildUserContextSummary,
  buildWorkoutPrompt,
  generateIntentPlan,
  generateWorkoutInstance
};
