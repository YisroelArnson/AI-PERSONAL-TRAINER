const { createClient } = require('@supabase/supabase-js');

const { env } = require('../../config/env');

let authClient;

function getSupabaseAuthClient() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    return null;
  }

  if (!authClient) {
    authClient = createClient(env.supabaseUrl, env.supabasePublishableKey);
  }

  return authClient;
}

module.exports = {
  getSupabaseAuthClient
};
