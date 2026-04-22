/**
 * File overview:
 * Provides infrastructure helpers for client.
 *
 * Main functions in this file:
 * - getSupabaseAuthClient: Gets Supabase auth client needed by this file.
 * - getSupabaseAdminClient: Gets Supabase admin client needed by this file.
 */

const { createClient } = require('@supabase/supabase-js');

const { env } = require('../../config/env');

let authClient;
let adminClient;

/**
 * Gets Supabase auth client needed by this file.
 */
function getSupabaseAuthClient() {
  const authKey = env.supabaseSecretKey || env.supabasePublishableKey;

  if (!env.supabaseUrl || !authKey) {
    return null;
  }

  if (!authClient) {
    authClient = createClient(env.supabaseUrl, authKey);
  }

  return authClient;
}

/**
 * Gets Supabase admin client needed by this file.
 */
function getSupabaseAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    return null;
  }

  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl, env.supabaseSecretKey);
  }

  return adminClient;
}

module.exports = {
  getSupabaseAuthClient,
  getSupabaseAdminClient
};
