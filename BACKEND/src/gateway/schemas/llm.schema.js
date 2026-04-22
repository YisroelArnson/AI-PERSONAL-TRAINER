/**
 * File overview:
 * Defines parsing and validation helpers for the llm payloads.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

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
