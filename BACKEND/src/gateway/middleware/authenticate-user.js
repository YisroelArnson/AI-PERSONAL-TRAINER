const { getSupabaseAuthClient, getSupabaseAdminClient } = require('../../infra/supabase/client');
const { env } = require('../../config/env');
const { startTimer } = require('../../runtime/services/performance-log.service');
const { unauthorized } = require('../../shared/errors');

async function ensureDevUserExists(userId) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return true;
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    const message = String(error.message || '').toLowerCase();

    if (message.includes('user not found') || message.includes('not found')) {
      return false;
    }

    throw error;
  }

  return Boolean(data && data.user);
}

async function authenticateUser(req, res, next) {
  const finish = startTimer({
    requestId: req.requestId || null,
    route: req.originalUrl || req.path || 'unknown',
    stage: 'auth'
  });

  if (env.allowUnauthenticatedDev) {
    if (!env.devAuthUserId) {
      finish({
        outcome: 'error',
        source: 'dev-bypass',
        errorCode: 'missing_dev_auth_user_id'
      });
      return next(unauthorized('DEV_AUTH_USER_ID is required when ALLOW_UNAUTHENTICATED_DEV=true'));
    }

    try {
      const userExists = await ensureDevUserExists(env.devAuthUserId);

      if (!userExists) {
        finish({
          outcome: 'error',
          source: 'dev-bypass',
          errorCode: 'missing_dev_user'
        });
        return next(unauthorized('DEV_AUTH_USER_ID no longer exists in Supabase Auth'));
      }

      req.auth = {
        userId: env.devAuthUserId,
        email: 'dev@example.com',
        role: 'developer',
        source: 'dev-bypass'
      };
      finish({
        outcome: 'ok',
        source: 'dev-bypass',
        userId: env.devAuthUserId
      });
      return next();
    } catch (error) {
      finish({
        outcome: 'error',
        source: 'dev-bypass',
        errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
      });
      return next(error);
    }
  }

  const authHeader = req.header('authorization');
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!token) {
    finish({
      outcome: 'error',
      source: 'supabase',
      errorCode: 'missing_bearer_token'
    });
    return next(unauthorized('Missing Bearer token'));
  }

  const supabase = getSupabaseAuthClient();
  if (!supabase) {
    finish({
      outcome: 'error',
      source: 'supabase',
      errorCode: 'supabase_auth_unconfigured'
    });
    return next(unauthorized('Supabase auth is not configured'));
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      finish({
        outcome: 'error',
        source: 'supabase',
        errorCode: 'invalid_or_expired_token'
      });
      return next(unauthorized('Invalid or expired token'));
    }

    req.auth = {
      userId: data.user.id,
      email: data.user.email,
      role: data.user.role,
      source: 'supabase'
    };
    finish({
      outcome: 'ok',
      source: 'supabase',
      userId: data.user.id
    });

    return next();
  } catch (error) {
    finish({
      outcome: 'error',
      source: 'supabase',
      errorMessage: error && error.message ? String(error.message).slice(0, 500) : 'Unknown error'
    });
    return next(error);
  }
}

module.exports = {
  authenticateUser
};
