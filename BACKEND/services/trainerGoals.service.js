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

async function draftGoalContract(userId) {
  const intake = await fetchLatestIntakeSummary(userId);
  const baseline = await fetchLatestAssessmentBaseline(userId);

  const prompt = `Create a fitness goal contract from the intake + assessment. Return JSON only.\n\nIntake: ${JSON.stringify(intake)}\nAssessment: ${JSON.stringify(baseline)}\n\nReturn JSON:\n{\n  "primary_goal": "string",
  "secondary_goal": "string",
  "timeline_weeks": number,
  "metrics": ["string"],
  "weekly_commitment": {"sessions_per_week": number, "minutes_per_session": number},
  "constraints": ["string"],
  "tradeoffs": ["string"],
  "assumptions": ["string"]\n}`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) throw new Error('Failed to parse goal contract');

  const { data, error } = await supabase
    .from('trainer_goal_contracts')
    .insert({
      user_id: userId,
      status: 'draft',
      version: 1,
      contract_json: parsed,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.from('trainer_goal_events').insert({
    goal_id: data.id,
    event_type: 'draft',
    data: parsed
  });

  return data;
}

async function editGoalContract(goalId, instruction) {
  const { data: existing, error } = await supabase
    .from('trainer_goal_contracts')
    .select('*')
    .eq('id', goalId)
    .single();

  if (error) throw error;

  const prompt = `Apply this edit to the GoalContract JSON. Return JSON only.\n\nInstruction: ${instruction}\n\nCurrent contract: ${JSON.stringify(existing.contract_json)}\n\nReturn JSON in the same schema.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');
  if (!parsed) throw new Error('Failed to parse edited goal contract');

  const nextVersion = (existing.version || 0) + 1;
  const { data: updated, error: updateError } = await supabase
    .from('trainer_goal_contracts')
    .update({
      contract_json: parsed,
      version: nextVersion,
      updated_at: nowIso()
    })
    .eq('id', goalId)
    .select()
    .single();

  if (updateError) throw updateError;

  await supabase.from('trainer_goal_events').insert({
    goal_id: goalId,
    event_type: 'edit',
    data: { instruction, contract: parsed }
  });

  return updated;
}

async function approveGoalContract(goalId) {
  const { data, error } = await supabase
    .from('trainer_goal_contracts')
    .update({
      status: 'approved',
      approved_at: nowIso(),
      updated_at: nowIso()
    })
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;

  await supabase.from('trainer_goal_events').insert({
    goal_id: goalId,
    event_type: 'approve',
    data: { approved_at: nowIso() }
  });

  return data;
}

async function getGoalContract(goalId) {
  const { data, error } = await supabase
    .from('trainer_goal_contracts')
    .select('*')
    .eq('id', goalId)
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  draftGoalContract,
  editGoalContract,
  approveGoalContract,
  getGoalContract
};
