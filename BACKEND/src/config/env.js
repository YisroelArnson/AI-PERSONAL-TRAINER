/**
 * File overview:
 * Provides the env logic used by this part of the codebase.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

const DEFAULT_EMBEDDING_MODEL_DIMENSIONS = Object.freeze({
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536
});

const resolvedDefaultEmbeddingModel = process.env.DEFAULT_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const resolvedDefaultEmbeddingDimensions = Number(
  process.env.DEFAULT_EMBEDDING_DIMENSIONS
  || DEFAULT_EMBEDDING_MODEL_DIMENSIONS[resolvedDefaultEmbeddingModel]
  || 1536
);
const defaultLlmRawIoLoggingDirectory = path.join(
  os.homedir(),
  'Documents',
  'AI Personal Trainer LLM Logs'
);

const env = {
  port: Number(process.env.PORT || 3000),
  allowUnauthenticatedDev: process.env.ALLOW_UNAUTHENTICATED_DEV === 'true',
  devAuthUserId: process.env.DEV_AUTH_USER_ID || '',
  supabaseUrl: process.env.SUPABASE_PUBLIC_URL || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  xaiApiKey: process.env.XAI_API_KEY || '',
  xaiApiBaseUrl: process.env.XAI_API_BASE_URL || 'https://api.x.ai/v1',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicPromptCachingEnabled: process.env.ANTHROPIC_PROMPT_CACHING_ENABLED !== 'false',
  anthropicConversationCacheTtl: process.env.ANTHROPIC_CONVERSATION_CACHE_TTL || '5m',
  anthropicStaticCacheTtl: process.env.ANTHROPIC_STATIC_CACHE_TTL || '5m',
  anthropicDynamicContextCacheTtl: process.env.ANTHROPIC_DYNAMIC_CONTEXT_CACHE_TTL || '5m',
  xaiPromptCachingEnabled: process.env.XAI_PROMPT_CACHING_ENABLED !== 'false',
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'xai',
  defaultAnthropicModel: process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  defaultXaiModel: process.env.DEFAULT_XAI_MODEL || 'grok-4-1-fast-reasoning',
  defaultEmbeddingProvider: process.env.DEFAULT_EMBEDDING_PROVIDER || 'openai',
  defaultOpenAiEmbeddingModel: resolvedDefaultEmbeddingModel,
  defaultEmbeddingDimensions: Math.max(1, Math.floor(resolvedDefaultEmbeddingDimensions)),
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 32),
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS || 10),
  agentMaxOutputTokens: Number(process.env.AGENT_MAX_OUTPUT_TOKENS || 4000),
  agentPromptMessageLimit: Number(process.env.AGENT_PROMPT_MESSAGE_LIMIT || 20),
  llmRawIoLoggingEnabled: process.env.LLM_RAW_IO_LOGGING_ENABLED === 'true',
  llmRawIoLoggingDirectory: process.env.LLM_RAW_IO_LOGGING_DIRECTORY || defaultLlmRawIoLoggingDirectory,
  redisUrl: process.env.REDIS_URL || '',
  runStreamRedisTtlSec: Number(process.env.RUN_STREAM_REDIS_TTL_SEC || 3600),
  runStreamRedisMaxLen: Number(process.env.RUN_STREAM_REDIS_MAX_LEN || 1000),
  verboseLlmStreamEventsEnabled: process.env.VERBOSE_LLM_STREAM_EVENTS_ENABLED === 'true',
  assistantDeltaFlushChars: Math.max(1, Number(process.env.ASSISTANT_DELTA_FLUSH_CHARS || 80)),
  documentCacheTtlSec: Number(process.env.DOCUMENT_CACHE_TTL_SEC || 3600),
  workoutStateCacheTtlSec: Number(process.env.WORKOUT_STATE_CACHE_TTL_SEC || 900),
  performanceLoggingEnabled: process.env.PERFORMANCE_LOGGING_ENABLED
    ? process.env.PERFORMANCE_LOGGING_ENABLED !== 'false'
    : process.env.NODE_ENV !== 'test',
  performanceLogFormat: process.env.PERFORMANCE_LOG_FORMAT || 'pretty',
  performanceLogSampleRate: Number(process.env.PERFORMANCE_LOG_SAMPLE_RATE || 1),
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  queueRetryMaxAttempts: Number(process.env.QUEUE_RETRY_MAX_ATTEMPTS || 8),
  queueRetryBaseDelayMs: Number(process.env.QUEUE_RETRY_BASE_DELAY_MS || 1000),
  queueRetryMaxDelayMs: Number(process.env.QUEUE_RETRY_MAX_DELAY_MS || 300000),
  promptContextCacheTtlSec: Number(process.env.PROMPT_CONTEXT_CACHE_TTL_SEC || 60),
  sessionResetPolicyCacheTtlSec: Number(process.env.SESSION_RESET_POLICY_CACHE_TTL_SEC || 60),
  indexingPolicyCacheTtlSec: Number(process.env.INDEXING_POLICY_CACHE_TTL_SEC || 60),
  rateLimitPolicyCacheTtlSec: Number(process.env.RATE_LIMIT_POLICY_CACHE_TTL_SEC || 60),
  concurrencyPolicyCacheTtlSec: Number(process.env.CONCURRENCY_POLICY_CACHE_TTL_SEC || 60),
  indexingDebounceMs: Number(process.env.INDEXING_DEBOUNCE_MS || 15000),
  sessionCompactionMinEventCount: Number(process.env.SESSION_COMPACTION_MIN_EVENT_COUNT || 80),
  sessionCompactionMinMessageCount: Number(process.env.SESSION_COMPACTION_MIN_MESSAGE_COUNT || 24),
  sessionCompactionDebounceMs: Number(process.env.SESSION_COMPACTION_DEBOUNCE_MS || 60000),
  retrievalMinScore: Number(process.env.RETRIEVAL_MIN_SCORE || 0.05),
  redisRetrievalVectorAlpha: Number(process.env.REDIS_RETRIEVAL_VECTOR_ALPHA || 0.65),
  redisRetrievalTextBeta: Number(process.env.REDIS_RETRIEVAL_TEXT_BETA || 0.35),
  gatewayMode: process.env.GATEWAY_MODE || 'scaffold'
};

module.exports = {
  env
};
