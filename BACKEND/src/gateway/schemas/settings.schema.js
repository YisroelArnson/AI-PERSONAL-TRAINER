/**
 * File overview:
 * Defines parsing and validation helpers for the settings payloads.
 *
 * Main functions in this file:
 * - parseUpdateLlmSettingsRequest: Parses Update LLM settings request into a validated shape.
 */

const { z } = require('zod');

const { llmSelectionSchema } = require('./llm.schema');

const updateLlmSettingsSchema = z.object({
  userDefaultLlm: llmSelectionSchema.nullable()
});

/**
 * Parses Update LLM settings request into a validated shape.
 */
function parseUpdateLlmSettingsRequest(body) {
  return updateLlmSettingsSchema.parse(body || {});
}

module.exports = {
  updateLlmSettingsSchema,
  parseUpdateLlmSettingsRequest
};
