const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number(process.env.PORT || 3000),
  allowUnauthenticatedDev: process.env.ALLOW_UNAUTHENTICATED_DEV === 'true',
  devAuthUserId: process.env.DEV_AUTH_USER_ID || '',
  supabaseUrl: process.env.SUPABASE_PUBLIC_URL || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  redisUrl: process.env.REDIS_URL || '',
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  gatewayMode: process.env.GATEWAY_MODE || 'scaffold'
};

module.exports = {
  env
};
