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
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicPromptCachingEnabled: process.env.ANTHROPIC_PROMPT_CACHING_ENABLED !== 'false',
  anthropicConversationCacheTtl: process.env.ANTHROPIC_CONVERSATION_CACHE_TTL || '5m',
  anthropicStaticCacheTtl: process.env.ANTHROPIC_STATIC_CACHE_TTL || '5m',
  anthropicDynamicContextCacheTtl: process.env.ANTHROPIC_DYNAMIC_CONTEXT_CACHE_TTL || '5m',
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'anthropic',
  defaultAnthropicModel: process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  defaultEmbeddingProvider: process.env.DEFAULT_EMBEDDING_PROVIDER || 'openai',
  defaultOpenAiEmbeddingModel: process.env.DEFAULT_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 32),
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS || 4),
  agentPromptMessageLimit: Number(process.env.AGENT_PROMPT_MESSAGE_LIMIT || 12),
  redisUrl: process.env.REDIS_URL || '',
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  promptContextCacheTtlSec: Number(process.env.PROMPT_CONTEXT_CACHE_TTL_SEC || 60),
  sessionResetPolicyCacheTtlSec: Number(process.env.SESSION_RESET_POLICY_CACHE_TTL_SEC || 60),
  indexingPolicyCacheTtlSec: Number(process.env.INDEXING_POLICY_CACHE_TTL_SEC || 60),
  indexingDebounceMs: Number(process.env.INDEXING_DEBOUNCE_MS || 15000),
  retrievalMinScore: Number(process.env.RETRIEVAL_MIN_SCORE || 0.05),
  gatewayMode: process.env.GATEWAY_MODE || 'scaffold'
};

module.exports = {
  env
};
