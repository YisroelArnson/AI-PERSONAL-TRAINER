const Anthropic = require('@anthropic-ai/sdk');

const { env } = require('../../config/env');

let anthropicClient;

function getAnthropicClient() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: env.anthropicApiKey
    });
  }

  return anthropicClient;
}

module.exports = {
  getAnthropicClient
};
