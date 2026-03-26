const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { badRequest, conflict } = require('../../shared/errors');

function requireIdempotencyKey(headers) {
  const idempotencyKey = headers['idempotency-key'] || headers['x-idempotency-key'];

  if (!idempotencyKey || !String(idempotencyKey).trim()) {
    throw badRequest('Missing Idempotency-Key header');
  }

  return String(idempotencyKey).trim();
}

async function lookupIdempotencyResponse({ userId, route, idempotencyKey, requestHash }) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('idempotency_keys')
    .select('user_id, route, request_hash, response_json')
    .eq('key', idempotencyKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  if (data.user_id !== userId || data.route !== route) {
    throw conflict('Idempotency key was reused with a different request');
  }

  if (data.request_hash !== requestHash) {
    throw conflict('Idempotency key was reused with a different request body');
  }

  if (!data.response_json) {
    return null;
  }

  return {
    ...data.response_json,
    replayed: true
  };
}

module.exports = {
  requireIdempotencyKey,
  lookupIdempotencyResponse
};
