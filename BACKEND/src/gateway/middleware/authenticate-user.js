const { getSupabaseAuthClient } = require('../../infra/supabase/client');
const { env } = require('../../config/env');
const { unauthorized } = require('../../shared/errors');

async function authenticateUser(req, res, next) {
  if (env.allowUnauthenticatedDev) {
    if (!env.devAuthUserId) {
      return next(unauthorized('DEV_AUTH_USER_ID is required when ALLOW_UNAUTHENTICATED_DEV=true'));
    }

    req.auth = {
      userId: env.devAuthUserId,
      email: 'dev@example.com',
      role: 'developer',
      source: 'dev-bypass'
    };
    return next();
  }

  const authHeader = req.header('authorization');
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!token) {
    return next(unauthorized('Missing Bearer token'));
  }

  const supabase = getSupabaseAuthClient();
  if (!supabase) {
    return next(unauthorized('Supabase auth is not configured'));
  }

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data || !data.claims) {
      return next(unauthorized('Invalid or expired token'));
    }

    req.auth = {
      userId: data.claims.sub,
      email: data.claims.email,
      role: data.claims.role,
      sessionId: data.claims.session_id,
      source: 'supabase'
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  authenticateUser
};
