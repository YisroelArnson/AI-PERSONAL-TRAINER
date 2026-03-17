const { createClient } = require('@supabase/supabase-js');

const { env } = require('../../config/env');

let authClient;
let adminClient;

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
