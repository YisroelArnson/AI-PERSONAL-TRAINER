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

  // Default fallback for unknown models
  'default': { 
    prompt: 5.00, 
    completion: 15.00 
  }
};

/**
 * Calculate cost for a given model and token usage
 * @param {string} model - Model name (e.g., 'gpt-4o', 'gpt-4o-mini')
 * @param {number} promptTokens - Number of prompt/input tokens
 * @param {number} completionTokens - Number of completion/output tokens
 * @param {number} cachedTokens - Number of cached prompt tokens (optional)
 * @returns {number} Cost in USD (as a decimal, e.g., 0.0025 for $0.0025)
 */
function calculateCost(model, promptTokens, completionTokens, cachedTokens = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  
  // Calculate non-cached prompt tokens
  const nonCachedPromptTokens = promptTokens - cachedTokens;
  
  // Calculate cost components
  let promptCost = (nonCachedPromptTokens * pricing.prompt) / 1_000_000;
  
  // Add cached token cost if applicable
  if (cachedTokens > 0 && pricing.cached_prompt) {
    promptCost += (cachedTokens * pricing.cached_prompt) / 1_000_000;
  }
  
  const completionCost = (completionTokens * pricing.completion) / 1_000_000;
  
  return promptCost + completionCost;
}

/**
 * Calculate cost in cents (for database storage)
 * @param {string} model - Model name
 * @param {number} promptTokens - Number of prompt tokens
 * @param {number} completionTokens - Number of completion tokens
 * @param {number} cachedTokens - Number of cached tokens (optional)
 * @returns {number} Cost in cents (e.g., 0.25 for $0.0025)
 */
function calculateCostCents(model, promptTokens, completionTokens, cachedTokens = 0) {
  return calculateCost(model, promptTokens, completionTokens, cachedTokens) * 100;
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
