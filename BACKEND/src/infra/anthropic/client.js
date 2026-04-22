/**
 * File overview:
 * Provides infrastructure helpers for client.
 *
 * Main functions in this file:
 * - getAnthropicClient: Gets Anthropic client needed by this file.
 */

const { env } = require('../../config/env');

let anthropicClient;

/**
 * Gets Anthropic client needed by this file.
 */
function getAnthropicClient() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');

    anthropicClient = new Anthropic({
      apiKey: env.anthropicApiKey
    });
  }

  return anthropicClient;
}

module.exports = {
  getAnthropicClient
};
