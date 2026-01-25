// BACKEND/services/observability/pricing.js
// Model pricing constants and cost calculation utilities

/**
 * Pricing per 1 million tokens (in USD)
 * Updated: January 2026
 * Source: https://openai.com/pricing
 */
const MODEL_PRICING = {
  // GPT-4o models
  'gpt-4o': { 
    prompt: 2.50, 
    completion: 10.00,
    cached_prompt: 1.25
  },
  'gpt-4o-2024-11-20': { 
    prompt: 2.50, 
    completion: 10.00,
    cached_prompt: 1.25
  },
  'gpt-4o-2024-08-06': { 
    prompt: 2.50, 
    completion: 10.00,
    cached_prompt: 1.25
  },
  
  // GPT-4o mini models
  'gpt-4o-mini': { 
    prompt: 0.15, 
    completion: 0.60,
    cached_prompt: 0.075
  },
  'gpt-4o-mini-2024-07-18': { 
    prompt: 0.15, 
    completion: 0.60,
    cached_prompt: 0.075
  },

  // GPT-4 Turbo
  'gpt-4-turbo': { 
    prompt: 10.00, 
    completion: 30.00 
  },
  'gpt-4-turbo-preview': { 
    prompt: 10.00, 
    completion: 30.00 
  },

  // GPT-4
  'gpt-4': { 
    prompt: 30.00, 
    completion: 60.00 
  },
  'gpt-4-32k': { 
    prompt: 60.00, 
    completion: 120.00 
  },

  // GPT-3.5 Turbo
  'gpt-3.5-turbo': { 
    prompt: 0.50, 
    completion: 1.50 
  },
  'gpt-3.5-turbo-0125': { 
    prompt: 0.50, 
    completion: 1.50 
  },

  // o1 models (reasoning)
  'o1': {
    prompt: 15.00,
    completion: 60.00,
    cached_prompt: 7.50
  },
  'o1-preview': {
    prompt: 15.00,
    completion: 60.00
  },
  'o1-mini': {
    prompt: 3.00,
    completion: 12.00,
    cached_prompt: 1.50
  },

  // ═══════════════════════════════════════════════════════════════
  // Anthropic Direct (native API) - Updated Jan 2026
  // Source: https://platform.claude.com/docs/en/about-claude/pricing
  // Cache pricing: write = 1.25x base, read = 0.1x base (90% discount!)
  // ═══════════════════════════════════════════════════════════════
  'claude-haiku-4-5': {
    prompt: 1.00,
    completion: 5.00,
    cache_write: 1.25,    // 1.25x base = $1.25/M
    cache_read: 0.10      // 0.1x base = $0.10/M (90% off!)
  },
  'claude-sonnet-4-5': {
    prompt: 3.00,
    completion: 15.00,
    cache_write: 3.75,    // 1.25x base = $3.75/M
    cache_read: 0.30      // 0.1x base = $0.30/M (90% off!)
  },
  'claude-sonnet-4-5-20250929': {
    prompt: 3.00,
    completion: 15.00,
    cache_write: 3.75,
    cache_read: 0.30
  },
  'claude-opus-4-5': {
    prompt: 5.00,
    completion: 25.00,
    cache_write: 6.25,    // 1.25x base = $6.25/M
    cache_read: 0.50      // 0.1x base = $0.50/M (90% off!)
  },

  // ═══════════════════════════════════════════════════════════════
  // Google via OpenRouter
  // ═══════════════════════════════════════════════════════════════
  'google/gemini-2.0-flash-exp:free': {
    prompt: 0,
    completion: 0
  },
  'google/gemini-pro-1.5': {
    prompt: 1.25,
    completion: 5.00
  },

  // ═══════════════════════════════════════════════════════════════
  // Moonshot via OpenRouter
  // ═══════════════════════════════════════════════════════════════
  'moonshotai/kimi-k2': {
    prompt: 0.50,
    completion: 2.40
  },
  'moonshotai/kimi-k2:free': {
    prompt: 0,
    completion: 0
  },

  // ═══════════════════════════════════════════════════════════════
  // DeepSeek via OpenRouter
  // ═══════════════════════════════════════════════════════════════
  'deepseek/deepseek-chat': {
    prompt: 0.14,
    completion: 0.28
  },

  // ═══════════════════════════════════════════════════════════════
  // Meta Llama via OpenRouter
  // ═══════════════════════════════════════════════════════════════
  'meta-llama/llama-3.1-405b-instruct': {
    prompt: 0.80,
    completion: 0.80
  },

  // Default fallback for unknown models
  'default': {
    prompt: 5.00,
    completion: 15.00
  }
};

/**
 * Calculate cost for a given model and token usage
 * @param {string} model - Model name (e.g., 'gpt-4o', 'claude-sonnet-4-5')
 * @param {number} promptTokens - Number of prompt/input tokens
 * @param {number} completionTokens - Number of completion/output tokens
 * @param {Object|number} cacheInfo - Cache token info (number for OpenAI, object for Anthropic)
 *   For OpenAI: number of cached_prompt tokens
 *   For Anthropic: { cache_creation_input_tokens, cache_read_input_tokens }
 * @returns {number} Cost in USD (as a decimal, e.g., 0.0025 for $0.0025)
 */
function calculateCost(model, promptTokens, completionTokens, cacheInfo = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];

  let promptCost = 0;
  let cacheCost = 0;

  // Handle different cache formats
  if (typeof cacheInfo === 'object' && cacheInfo !== null) {
    // Anthropic format: { cache_creation_input_tokens, cache_read_input_tokens }
    const cacheWrite = cacheInfo.cache_creation_input_tokens || 0;
    const cacheRead = cacheInfo.cache_read_input_tokens || 0;

    // Non-cached tokens = total input - cache read (cache write is separate)
    const nonCachedPromptTokens = promptTokens;
    promptCost = (nonCachedPromptTokens * pricing.prompt) / 1_000_000;

    // Add cache costs if model supports it
    if (pricing.cache_write && cacheWrite > 0) {
      cacheCost += (cacheWrite * pricing.cache_write) / 1_000_000;
    }
    if (pricing.cache_read && cacheRead > 0) {
      cacheCost += (cacheRead * pricing.cache_read) / 1_000_000;
    }
  } else {
    // OpenAI format: single number for cached tokens
    const cachedTokens = cacheInfo || 0;
    const nonCachedPromptTokens = promptTokens - cachedTokens;
    promptCost = (nonCachedPromptTokens * pricing.prompt) / 1_000_000;

    // Add cached token cost if applicable (OpenAI style)
    if (cachedTokens > 0 && pricing.cached_prompt) {
      cacheCost = (cachedTokens * pricing.cached_prompt) / 1_000_000;
    }
  }

  const completionCost = (completionTokens * pricing.completion) / 1_000_000;

  return promptCost + cacheCost + completionCost;
}

/**
 * Calculate cost in cents (for database storage)
 * @param {string} model - Model name
 * @param {number} promptTokens - Number of prompt tokens
 * @param {number} completionTokens - Number of completion tokens
 * @param {Object|number} cacheInfo - Cache token info (see calculateCost)
 * @returns {number} Cost in cents (e.g., 0.25 for $0.0025)
 */
function calculateCostCents(model, promptTokens, completionTokens, cacheInfo = 0) {
  return calculateCost(model, promptTokens, completionTokens, cacheInfo) * 100;
}

/**
 * Get pricing info for a model
 * @param {string} model - Model name
 * @returns {Object} Pricing object with prompt and completion rates
 */
function getModelPricing(model) {
  return MODEL_PRICING[model] || MODEL_PRICING['default'];
}

/**
 * Check if a model is known
 * @param {string} model - Model name
 * @returns {boolean} True if model pricing is defined
 */
function isKnownModel(model) {
  return model in MODEL_PRICING && model !== 'default';
}

/**
 * Format cost for display
 * @param {number} costUsd - Cost in USD
 * @returns {string} Formatted cost string
 */
function formatCost(costUsd) {
  if (costUsd < 0.01) {
    return `$${(costUsd * 100).toFixed(4)}¢`;
  }
  return `$${costUsd.toFixed(4)}`;
}

module.exports = {
  MODEL_PRICING,
  calculateCost,
  calculateCostCents,
  getModelPricing,
  isKnownModel,
  formatCost
};
