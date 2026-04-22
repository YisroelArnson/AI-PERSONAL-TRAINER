/**
 * File overview:
 * Provides infrastructure helpers for client.
 *
 * Main functions in this file:
 * - getOpenAIClient: Gets Open AI client needed by this file.
 */

const OpenAI = require('openai');

const { env } = require('../../config/env');

let openAiClient;

/**
 * Gets Open AI client needed by this file.
 */
function getOpenAIClient() {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey: env.openaiApiKey
    });
  }

  return openAiClient;
}

module.exports = {
  getOpenAIClient
};
