const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

const ASSESSMENT_STEPS = [
  { id: 'B0_intro', title: 'Welcome', type: 'info', prompt: 'Find a clear space to move. We will run a quick baseline check.' },
  { id: 'B1_new_pain_check', title: 'Pain check', type: 'question', prompt: 'Any new aches or pains today that affect movement?', options: ['No', 'Yes'] },
  { id: 'B2_squat_5reps', title: 'Squat pattern', type: 'movement', prompt: 'Perform 5 bodyweight squats. Then answer the prompts.' },
  { id: 'B3_single_leg_balance', title: 'Balance', type: 'timer', prompt: 'Hold single-leg balance for 20s on each side.' },
  { id: 'B4_overhead_reach_wall', title: 'Overhead reach', type: 'movement', prompt: 'Stand against a wall and reach overhead.' },
  { id: 'B5_toe_touch', title: 'Toe touch', type: 'movement', prompt: 'Reach toward your toes and note how far you get.' },
  { id: 'B6_pushup_position_hold_15s', title: 'Push-up hold', type: 'timer', prompt: 'Hold push-up position for 15 seconds.' },
  { id: 'B7_pushups_amrap', title: 'Push-ups', type: 'question', prompt: 'How many push-ups can you do with good form?' },
  { id: 'B8_squat_endurance_60s', title: 'Squat endurance', type: 'timer', prompt: 'Do squats for 60 seconds and record count.' },
  { id: 'B9_plank_hold', title: 'Plank hold', type: 'timer', prompt: 'Hold a plank as long as comfortable.' },
  { id: 'B10_cardiovascular_check', title: 'Cardio check', type: 'question', prompt: 'Choose jumping jacks (20) or march in place (30s). How did it feel?' },
  { id: 'B11_tight_areas', title: 'Tight areas', type: 'question', prompt: 'Which areas feel tight today?' },
  { id: 'B12_weak_areas', title: 'Weak areas', type: 'question', prompt: 'Which areas feel weak or unstable?' },
  { id: 'B13_coordination', title: 'Coordination', type: 'question', prompt: 'How coordinated do you feel today?' },
  { id: 'B14_recovery_time', title: 'Recovery time', type: 'question', prompt: 'How long do you typically need to recover after a workout?' },
  { id: 'B15_complete', title: 'Complete', type: 'complete', prompt: 'Assessment complete.' }
];

function nowIso() {
  return new Date().toISOString();
}

async function getActiveSession(userId) {
  const { data, error } = await supabase
    .from('trainer_assessment_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createSession(userId) {
  const firstStep = ASSESSMENT_STEPS[0];
  const { data, error } = await supabase
    .from('trainer_assessment_sessions')
    .insert({
      user_id: userId,
      status: 'in_progress',
      current_step_id: firstStep.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateSession(userId) {
  const active = await getActiveSession(userId);
  if (active) return active;
  return createSession(userId);
}

async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('trainer_assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

async function updateSession(sessionId, updates) {
  const { data, error } = await supabase
    .from('trainer_assessment_sessions')
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
    .from('trainer_assessment_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sequence_number || 0) + 1;
}

async function logEvent(sessionId, eventType, data) {
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const sequenceNumber = await getNextSequence(sessionId);
    const { data: event, error } = await supabase
      .from('trainer_assessment_events')
      .insert({
        session_id: sessionId,
        sequence_number: sequenceNumber,
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

function getStepIndex(stepId) {
  return ASSESSMENT_STEPS.findIndex(step => step.id === stepId);
}

function getNextStep(stepId) {
  const idx = getStepIndex(stepId);
  if (idx === -1) return null;
  return ASSESSMENT_STEPS[idx + 1] || null;
}

async function submitStepResult(sessionId, stepId, result) {
  await logEvent(sessionId, 'step_result', { step_id: stepId, result });

  const { data, error } = await supabase
    .from('trainer_assessment_step_results')
    .insert({
      session_id: sessionId,
      step_id: stepId,
      result_json: result
    })
    .select()
    .single();

  if (error) throw error;

  const nextStep = getNextStep(stepId);
  if (nextStep) {
    await updateSession(sessionId, { current_step_id: nextStep.id });
  }

  return { result: data, nextStep };
}

async function skipStep(sessionId, stepId, reason) {
  await logEvent(sessionId, 'skip', { step_id: stepId, reason });
  const nextStep = getNextStep(stepId);
  if (nextStep) {
    await updateSession(sessionId, { current_step_id: nextStep.id });
  }
  return nextStep;
}

async function getStepResults(sessionId) {
  const { data, error } = await supabase
    .from('trainer_assessment_step_results')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return null;
  }
}

async function synthesizeBaseline(sessionId) {
  const results = await getStepResults(sessionId);
  const prompt = `You are summarizing a fitness assessment baseline. Return JSON only.\n\nResults:\n${JSON.stringify(results)}\n\nReturn JSON:\n{\n  "readiness": "string",
  "strength": "string",
  "mobility": "string",
  "conditioning": "string",
  "pain_flags": "string",
  "confidence": "low|medium|high",
  "notes": "string"\n}`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) {
    throw new Error('Failed to parse assessment baseline');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('trainer_assessment_baselines')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  const version = (existing?.version || 0) + 1;

  const { data: baseline, error } = await supabase
    .from('trainer_assessment_baselines')
    .insert({
      session_id: sessionId,
      version,
      baseline_json: parsed,
      created_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;

  await logEvent(sessionId, 'baseline_generated', parsed);
  await updateSession(sessionId, { status: 'completed' });
  return baseline;
}

module.exports = {
  ASSESSMENT_STEPS,
  getOrCreateSession,
  getSession,
  submitStepResult,
  skipStep,
  synthesizeBaseline
};
