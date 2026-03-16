const { z } = require('zod');

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionKey: z.string().trim().min(1).max(255).optional(),
  triggerType: z.enum(['user.message', 'app.opened', 'ui.action.start_workout']).default('user.message'),
  metadata: z.record(z.string(), z.unknown()).optional()
});

function parseMessageRequest(body) {
  return messageSchema.parse(body);
}

module.exports = {
  messageSchema,
  parseMessageRequest
};
