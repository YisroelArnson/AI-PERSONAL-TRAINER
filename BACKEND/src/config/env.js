const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number(process.env.PORT || 3000),
  allowUnauthenticatedDev: process.env.ALLOW_UNAUTHENTICATED_DEV === 'true',
  supabaseUrl: process.env.SUPABASE_PUBLIC_URL || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  gatewayMode: process.env.GATEWAY_MODE || 'scaffold'
};

module.exports = {
  env
};
