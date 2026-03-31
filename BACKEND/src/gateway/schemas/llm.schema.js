const { z } = require('zod');

const llmProviderSchema = z.enum(['anthropic', 'xai']);
const llmModelSchema = z.string().trim().min(1).max(255);

const llmSelectionSchema = z.object({
  provider: llmProviderSchema,
  model: llmModelSchema.optional()
});

module.exports = {
  llmProviderSchema,
  llmModelSchema,
  llmSelectionSchema
};
