/**
 * File overview:
 * Implements the workout commands service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - processWorkoutCommand: Processes Workout command through this file's workflow.
 */

const { executeWorkoutCommand } = require('../../runtime/services/workout-command.service');

/**
 * Processes Workout command through this file's workflow.
 */
async function processWorkoutCommand({ auth, headers, body }) {
  return executeWorkoutCommand({
    userId: auth.userId,
    command: body,
    headers,
    requestedLlm: body.llm || null
  });
}

module.exports = {
  processWorkoutCommand
};
