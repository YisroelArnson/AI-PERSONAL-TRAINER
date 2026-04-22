/**
 * File overview:
 * Provides infrastructure helpers for client.
 *
 * Main functions in this file:
 * - getXAIClient: Gets xAI client needed by this file.
 */

const OpenAI = require('openai');

const { env } = require('../../config/env');

let xaiClient;

/**
 * Gets xAI client needed by this file.
 */
function getXAIClient() {
  if (!env.xaiApiKey) {
    throw new Error('XAI_API_KEY is not configured');
  }

  if (!xaiClient) {
    xaiClient = new OpenAI({
      apiKey: env.xaiApiKey,
      baseURL: env.xaiApiBaseUrl
    });
  }

  return xaiClient;
}

module.exports = {
  getXAIClient
};
