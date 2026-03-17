const { getSupabaseAdminClient } = require('../../infra/supabase/client');

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

async function getRunById(runId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('run_id', runId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateRun(runId, patch) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('runs')
    .update(patch)
    .eq('run_id', runId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function markRunRunning(runId) {
  return updateRun(runId, {
    status: 'running',
    started_at: new Date().toISOString(),
    error_code: null,
    error_message: null
  });
}

async function markRunSucceeded(runId) {
  return updateRun(runId, {
    status: 'succeeded',
    finished_at: new Date().toISOString(),
    error_code: null,
    error_message: null
  });
}

async function markRunFailed(runId, error) {
  return updateRun(runId, {
    status: 'failed',
    finished_at: new Date().toISOString(),
    error_code: 'worker_error',
    error_message: error && error.message ? error.message.slice(0, 1000) : 'Unknown worker error'
  });
}

module.exports = {
  getRunById,
  markRunRunning,
  markRunSucceeded,
  markRunFailed
};
