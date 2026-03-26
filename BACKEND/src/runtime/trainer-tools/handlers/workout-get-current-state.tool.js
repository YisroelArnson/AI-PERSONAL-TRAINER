const { getCurrentWorkoutState } = require('../../services/workout-state.service');
const { workoutGetCurrentStateToolInputJsonSchema } = require('../../schemas/workout-tool-contracts.schema');
const { semanticError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_get_current_state',
  category: 'workout execution',
  mutating: false,
  description: 'Load the current live workout state, including the current exercise, set pointer, and stored authored plan.',
  inputSchema: workoutGetCurrentStateToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  const workout = await getCurrentWorkoutState({
    userId,
    sessionKey: run.session_key,
    workoutSessionId: input.workoutSessionId || null
  });

  if (!workout) {
    return semanticError(
      'NO_ACTIVE_WORKOUT',
      'There is no current workout available for this user in the active session context.',
      'Generate a workout first or ask the user whether they want to start training now.',
      {
        suggested_tool: 'workout_generate'
      }
    );
  }

  return {
    status: 'ok',
    output: {
      workout
    }
  };
}

module.exports = {
  definition,
  execute
};
