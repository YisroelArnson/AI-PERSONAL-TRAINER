const OpenAI = require('openai');

const { env } = require('../../config/env');

let openAiClient;

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
