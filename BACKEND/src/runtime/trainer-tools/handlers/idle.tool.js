/**
 * File overview:
 * Implements the trainer tool handler for idle.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 * - isTerminalCall: Handles Is terminal call for idle.tool.js.
 */

const definition = {
  name: 'idle',
  category: 'run control',
  mutating: false,
  description: 'End the current run without sending a user-facing message.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      }
    },
    additionalProperties: false
  }
};

/**
 * Executes the main action flow.
 */
async function execute({ input }) {
  const reason = input && typeof input.reason === 'string'
    ? String(input.reason).trim() || null
    : null;

  return {
    status: 'ok',
    output: {
      reason
    }
  };
}

/**
 * Handles Is terminal call for idle.tool.js.
 */
function isTerminalCall() {
  return true;
}

module.exports = {
  definition,
  execute,
  isTerminalCall
};
