const { z } = require('zod');

const sessionResetSchema = z.object({
  sessionKey: z.string().trim().min(1).max(255).optional()
});

function parseSessionResetRequest(body) {
  return sessionResetSchema.parse(body || {});
}

module.exports = {
  sessionResetSchema,
  parseSessionResetRequest
};
