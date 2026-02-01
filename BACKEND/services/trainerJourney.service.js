const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_STATE = {
  state: 'not_started',
  intake_status: 'not_started',
  assessment_status: 'not_started',
  goals_status: 'not_started',
  program_status: 'not_started',
  monitoring_status: 'not_started'
};

function computeOverallState(record) {
  if (record.program_status === 'active') return 'program_active';
  if (record.program_status === 'complete' || record.program_status === 'in_progress') return 'program_design_in_progress';
  if (record.goals_status === 'in_progress') return 'goals_in_progress';
  if (record.assessment_status === 'in_progress') return 'assessment_in_progress';
  if (record.intake_status === 'in_progress') return 'intake_in_progress';
  if (record.goals_status === 'complete') return 'goals_complete';
  if (record.assessment_status === 'complete') return 'assessment_complete';
  if (record.intake_status === 'complete') return 'intake_complete';
  return 'not_started';
}

async function getOrCreateJourney(userId) {
  const { data, error } = await supabase
    .from('trainer_journey_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return data;
  }

  const { data: created, error: createError } = await supabase
    .from('trainer_journey_state')
    .insert({
      user_id: userId,
      ...DEFAULT_STATE,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

async function updateJourney(userId, patch) {
  const existing = await getOrCreateJourney(userId);
  const next = {
    ...existing,
    ...patch
  };

  next.state = computeOverallState(next);
  next.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('trainer_journey_state')
    .update({
      state: next.state,
      intake_status: next.intake_status,
      assessment_status: next.assessment_status,
      goals_status: next.goals_status,
      program_status: next.program_status,
      monitoring_status: next.monitoring_status,
      updated_at: next.updated_at
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function setPhaseStatus(userId, phase, status) {
  const patch = {};
  switch (phase) {
    case 'intake':
      patch.intake_status = status;
      break;
    case 'assessment':
      patch.assessment_status = status;
      break;
    case 'goals':
      patch.goals_status = status;
      break;
    case 'program':
      patch.program_status = status;
      break;
    case 'monitoring':
      patch.monitoring_status = status;
      break;
    default:
      return getOrCreateJourney(userId);
  }
  return updateJourney(userId, patch);
}

module.exports = {
  getOrCreateJourney,
  updateJourney,
  setPhaseStatus
};
