// BACKEND/services/modelProviders.service.js
// Anthropic-only model provider configuration
// Simplified from multi-provider setup to focus on Anthropic with proper caching

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Model registry for available Anthropic models
 * All models support native tool use and prompt caching
 */
const MODEL_REGISTRY = {
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    pricing: {
      prompt: 1.00,           // $1.00 per MTok
      completion: 5.00,       // $5.00 per MTok
      cached_prompt: 0.10     // $0.10 per MTok (90% discount)
    },
    notes: 'Fastest Claude, matches Sonnet 4 on coding/agents. SWE-bench: 73.3%'
  },
  'claude-sonnet-4-5': {
    displayName: 'Claude Sonnet 4.5',
    pricing: {
      prompt: 3.00,
      completion: 15.00,
      cached_prompt: 0.30
    },
    notes: 'Best coding model, excellent for complex agents'
  },
  'claude-opus-4-5': {
    displayName: 'Claude Opus 4.5',
    pricing: {
      prompt: 5.00,
      completion: 25.00,
      cached_prompt: 0.50
    },
    notes: 'Premium model, maximum intelligence'
  }
};

// Cached Anthropic client instance
let anthropicClient = null;

/**
 * Get Anthropic client (singleton)
 * @returns {Object} Anthropic client instance
 */
function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

/**
 * Get model configuration
 * @param {string} modelId - Model ID
 * @returns {Object} Model config or null
 */
function getModelConfig(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * List all available models
 * @returns {Array} Array of { id, displayName, pricing, notes }
 */
function listAvailableModels() {
  return Object.entries(MODEL_REGISTRY).map(([id, config]) => ({
    id,
    displayName: config.displayName,
    pricing: config.pricing,
    notes: config.notes
  }));
}

module.exports = {
  MODEL_REGISTRY,
  getAnthropicClient,
  getModelConfig,
  listAvailableModels
};
