/**
 * File overview:
 * Implements runtime service logic for run state.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - getRunById: Gets Run by ID needed by this file.
 * - listRunsByStatus: Lists Runs by status for the caller.
 * - updateRun: Updates Run with the latest state.
 * - markRunQueuedForReplay: Marks Run queued for replay with the appropriate status.
 * - markRunRunning: Marks Run running with the appropriate status.
 * - markRunSucceeded: Marks Run succeeded with the appropriate status.
 * - markRunFailed: Marks Run failed with the appropriate status.
 */

const { getSupabaseAdminClient } = require('../../infra/supabase/client');

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Gets Run by ID needed by this file.
 */
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

/**
 * Lists Runs by status for the caller.
 */
async function listRunsByStatus(statuses, limit = 100) {
  const supabase = getAdminClientOrThrow();
  const normalizedStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [statuses].filter(Boolean);
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .in('status', normalizedStatuses)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Updates Run with the latest state.
 */
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

/**
 * Marks Run queued for replay with the appropriate status.
 */
async function markRunQueuedForReplay(runId) {
  return updateRun(runId, {
    status: 'queued',
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null
  });
}

/**
 * Marks Run running with the appropriate status.
 */
async function markRunRunning(runId, metadata = {}) {
  return updateRun(runId, {
    status: 'running',
    started_at: new Date().toISOString(),
    provider_key: metadata.providerKey || null,
    model_key: metadata.modelKey || null,
    error_code: null,
    error_message: null
  });
}

/**
 * Marks Run succeeded with the appropriate status.
 */
async function markRunSucceeded(runId) {
  return updateRun(runId, {
    status: 'succeeded',
    finished_at: new Date().toISOString(),
    error_code: null,
    error_message: null
  });
}

/**
 * Marks Run failed with the appropriate status.
 */
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
  listRunsByStatus,
  markRunQueuedForReplay,
  markRunRunning,
  markRunSucceeded,
  markRunFailed
};
