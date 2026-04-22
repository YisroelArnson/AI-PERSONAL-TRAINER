/**
 * File overview:
 * Defines parsing and validation helpers for the session reset payloads.
 *
 * Main functions in this file:
 * - parseSessionResetRequest: Parses Session reset request into a validated shape.
 */

const { z } = require('zod');

const sessionResetSchema = z.object({
  sessionKey: z.string().trim().min(1).max(255).optional()
});

/**
 * Parses Session reset request into a validated shape.
 */
function parseSessionResetRequest(body) {
  return sessionResetSchema.parse(body || {});
}

module.exports = {
  sessionResetSchema,
  parseSessionResetRequest
};
