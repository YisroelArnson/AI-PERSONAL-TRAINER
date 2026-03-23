const { getSupabaseAuthClient, getSupabaseAdminClient } = require('../../infra/supabase/client');
const { env } = require('../../config/env');
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
  if (env.allowUnauthenticatedDev) {
    if (!env.devAuthUserId) {
      return next(unauthorized('DEV_AUTH_USER_ID is required when ALLOW_UNAUTHENTICATED_DEV=true'));
    }

    try {
      const userExists = await ensureDevUserExists(env.devAuthUserId);

      if (!userExists) {
        return next(unauthorized('DEV_AUTH_USER_ID no longer exists in Supabase Auth'));
      }

      req.auth = {
        userId: env.devAuthUserId,
        email: 'dev@example.com',
        role: 'developer',
        source: 'dev-bypass'
      };
      return next();
    } catch (error) {
      return next(error);
    }
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
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return next(unauthorized('Invalid or expired token'));
    }

    req.auth = {
      userId: data.user.id,
      email: data.user.email,
      role: data.user.role,
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
