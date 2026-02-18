const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function sanitizeLimit(value, fallback = 10, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

const DEFAULT_QUESTIONS = [
  { id: 'energy', label: 'Energy level', type: 'scale_1_5' },
  { id: 'soreness', label: 'Soreness level', type: 'scale_1_5' },
  { id: 'stress', label: 'Stress level', type: 'scale_1_5' },
  { id: 'pain', label: 'Any pain today?', type: 'yes_no_note' },
  { id: 'schedule', label: 'Schedule changes this week?', type: 'text_optional' }
];

function buildSummary(responses) {
  const energy = responses?.energy ?? null;
  const soreness = responses?.soreness ?? null;
  const stress = responses?.stress ?? null;
  const pain = responses?.pain?.value ?? responses?.pain ?? null;
  const notes = responses?.pain?.note || responses?.schedule || '';

  return {
    energy,
    soreness,
    stress,
    pain,
    notes,
    focus:
      pain === 'yes'
        ? 'We will keep sessions gentle and pain-aware.'
        : energy !== null && energy <= 2
          ? 'We will keep intensity conservative and emphasize recovery.'
          : 'Keep momentum with steady sessions.'
  };
}

async function getOrCreateCheckin(userId, type = 'weekly') {
  const { data: existing, error } = await supabase
    .from('trainer_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_type', type)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (existing) {
    return existing;
  }

  const { data, error: insertError } = await supabase
    .from('trainer_checkins')
    .insert({
      user_id: userId,
      checkin_type: type,
      status: 'in_progress',
      responses_json: {}
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return data;
}

async function submitCheckin(checkinId, userId, responses) {
  const summary = buildSummary(responses || {});

  const { data, error } = await supabase
    .from('trainer_checkins')
    .update({
      responses_json: responses || {},
      summary_json: summary,
      status: 'complete',
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
    .eq('id', checkinId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listCheckins(userId, limit = 10) {
  const safeLimit = sanitizeLimit(limit, 10, 100);

  const { data, error } = await supabase
    .from('trainer_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

module.exports = {
  DEFAULT_QUESTIONS,
  getOrCreateCheckin,
  submitCheckin,
  listCheckins
};
