const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number(process.env.PORT || 3000),
  allowUnauthenticatedDev: process.env.ALLOW_UNAUTHENTICATED_DEV === 'true',
  devAuthUserId: process.env.DEV_AUTH_USER_ID || '',
  supabaseUrl: process.env.SUPABASE_PUBLIC_URL || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicPromptCachingEnabled: process.env.ANTHROPIC_PROMPT_CACHING_ENABLED !== 'false',
  anthropicConversationCacheTtl: process.env.ANTHROPIC_CONVERSATION_CACHE_TTL || '5m',
  anthropicStaticCacheTtl: process.env.ANTHROPIC_STATIC_CACHE_TTL || '5m',
  anthropicDynamicContextCacheTtl: process.env.ANTHROPIC_DYNAMIC_CONTEXT_CACHE_TTL || '5m',
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'anthropic',
  defaultAnthropicModel: process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS || 4),
  agentPromptMessageLimit: Number(process.env.AGENT_PROMPT_MESSAGE_LIMIT || 12),
  redisUrl: process.env.REDIS_URL || '',
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  promptContextCacheTtlSec: Number(process.env.PROMPT_CONTEXT_CACHE_TTL_SEC || 60),
  gatewayMode: process.env.GATEWAY_MODE || 'scaffold'
};

module.exports = {
  env
};
