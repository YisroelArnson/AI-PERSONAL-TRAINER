/**
 * File overview:
 * Defines parsing and validation helpers for the message payloads.
 *
 * Main functions in this file:
 * - parseMessageRequest: Parses Message request into a validated shape.
 */

const { z } = require('zod');
const { llmSelectionSchema } = require('./llm.schema');

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionKey: z.string().trim().min(1).max(255).optional(),
  triggerType: z.enum([
    'user.message',
    'app.opened',
    'ui.action.start_workout',
    'ui.action.complete_set'
  ]).default('user.message'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  llm: llmSelectionSchema.optional()
});

/**
 * Parses Message request into a validated shape.
 */
function parseMessageRequest(body) {
  return messageSchema.parse(body);
}

module.exports = {
  messageSchema,
  parseMessageRequest
};
