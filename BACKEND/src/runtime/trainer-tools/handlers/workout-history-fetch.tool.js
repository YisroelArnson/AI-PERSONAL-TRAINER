const { ZodError } = require('zod');

const { getWorkoutHistory } = require('../../services/workout-state.service');
const {
  workoutHistoryFetchToolInputSchema,
  workoutHistoryFetchToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_history_fetch',
  category: 'context',
  mutating: false,
  description: 'Fetch structured workout history from the canonical workout tables for one local date or an inclusive local date range.',
  inputSchema: workoutHistoryFetchToolInputJsonSchema
};

async function execute({ input, userId }) {
  let parsedInput;

  try {
    parsedInput = workoutHistoryFetchToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed workout history request.' });
    }

    throw error;
  }

  const history = await getWorkoutHistory({
    userId,
    input: parsedInput
  });

  return {
    status: 'ok',
    output: {
      history
    }
  };
}

module.exports = {
  definition,
  execute
};
