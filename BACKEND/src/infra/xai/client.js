const OpenAI = require('openai');

const { env } = require('../../config/env');

let xaiClient;

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
