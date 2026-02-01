const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function nowIso() {
  return new Date().toISOString();
}

async function fetchLatestIntakeSummary(userId) {
  const { data, error } = await supabase
    .from('trainer_intake_summaries')
    .select('summary_json, trainer_intake_sessions!inner(user_id)')
    .eq('trainer_intake_sessions.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.summary_json || null;
}

async function fetchLatestAssessmentBaseline(userId) {
  const { data, error } = await supabase
    .from('trainer_assessment_baselines')
    .select('baseline_json, trainer_assessment_sessions!inner(user_id)')
    .eq('trainer_assessment_sessions.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.baseline_json || null;
}

async function fetchApprovedGoal(userId) {
  const { data, error } = await supabase
    .from('trainer_goal_contracts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.contract_json || null;
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

async function draftProgram(userId) {
  const intake = await fetchLatestIntakeSummary(userId);
  const baseline = await fetchLatestAssessmentBaseline(userId);
  const goals = await fetchApprovedGoal(userId);

  const prompt = `Create a structured TrainingProgram JSON for a user. Return JSON only.\n\nIntake: ${JSON.stringify(intake)}\nAssessment: ${JSON.stringify(baseline)}\nGoals: ${JSON.stringify(goals)}\n\nReturn JSON:\n{\n  "identity": {"program_id": "", "version": 1, "created_at": "${nowIso()}", "assumptions": ["string"]},\n  "goals": {"primary": "", "secondary": "", "timeline_weeks": 8, "metrics": ["string"]},\n  "weekly_template": {"days_per_week": 3, "session_types": ["string"], "preferred_days": ["Mon", "Wed", "Fri"]},\n  "sessions": [{"focus": "", "duration_min": 45, "equipment": ["string"], "notes": ""}],\n  "progression": {"strategy": "RPE based", "deload_trigger": "string", "time_scaling": ["45", "30", "15"]},\n  "exercise_rules": {"avoid": ["string"], "prefer": ["string"]},\n  "guardrails": {"pain_scale": "Stop if sharp pain", "red_flags": ["string"]},\n  "coach_cues": ["string"]\n}`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 768,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) throw new Error('Failed to parse program');

  const { data, error } = await supabase
    .from('trainer_programs')
    .insert({
      user_id: userId,
      status: 'draft',
      version: 1,
      program_json: parsed,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;
  await supabase.from('trainer_program_events').insert({
    program_id: data.id,
    event_type: 'draft',
    data: parsed
  });

  return data;
}

async function editProgram(programId, instruction) {
  const { data: existing, error } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (error) throw error;

  const prompt = `Apply this edit to TrainingProgram JSON. Return JSON only.\n\nInstruction: ${instruction}\n\nProgram: ${JSON.stringify(existing.program_json)}\n\nReturn updated JSON.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 768,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) throw new Error('Failed to parse edited program');

  const nextVersion = (existing.version || 0) + 1;
  const { data, error: updateError } = await supabase
    .from('trainer_programs')
    .update({
      program_json: parsed,
      version: nextVersion,
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (updateError) throw updateError;
  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'edit',
    data: { instruction, program: parsed }
  });

  return data;
}

async function approveProgram(programId) {
  const { data, error } = await supabase
    .from('trainer_programs')
    .update({
      status: 'approved',
      approved_at: nowIso(),
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (error) throw error;
  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'approve',
    data: { approved_at: nowIso() }
  });
  return data;
}

async function activateProgram(programId) {
  const { data: program, error } = await supabase
    .from('trainer_programs')
    .update({
      status: 'active',
      active_from: nowIso(),
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('trainer_active_program')
    .upsert({
      user_id: program.user_id,
      program_id: program.id,
      program_version: program.version,
      updated_at: nowIso()
    });

  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'activate',
    data: { activated_at: nowIso() }
  });

  return program;
}

async function getProgram(programId) {
  const { data, error } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', programId)
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  draftProgram,
  editProgram,
  approveProgram,
  activateProgram,
  getProgram
};
