const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { badRequest, conflict } = require('../../shared/errors');

function mapRpcError(error) {
  const message = error && error.message ? error.message : 'manual_reset_session failed';

  if (
    message.includes('IDEMPOTENCY_KEY_SCOPE_MISMATCH') ||
    message.includes('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST')
  ) {
    return conflict('Idempotency key was reused with a different request body');
  }

  if (
    message.includes('MISSING_USER_ID') ||
    message.includes('MISSING_ROUTE') ||
    message.includes('MISSING_IDEMPOTENCY_KEY') ||
    message.includes('MISSING_REQUEST_HASH')
  ) {
    return badRequest('manual_reset_session parameters were incomplete');
  }

  return error;
}

async function resetSessionHead({
  userId,
  route,
  idempotencyKey,
  requestHash,
  sessionKey
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  const { data, error } = await supabase.rpc('manual_reset_session', {
    p_user_id: userId,
    p_route: route,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_session_key: sessionKey || null
  });

  if (error) {
    throw mapRpcError(error);
  }

  return data;
}

module.exports = {
  resetSessionHead
};
