const { z } = require('zod');

const { llmSelectionSchema } = require('./llm.schema');

const updateLlmSettingsSchema = z.object({
  userDefaultLlm: llmSelectionSchema.nullable()
});

function parseUpdateLlmSettingsRequest(body) {
  return updateLlmSettingsSchema.parse(body || {});
}

module.exports = {
  updateLlmSettingsSchema,
  parseUpdateLlmSettingsRequest
};
