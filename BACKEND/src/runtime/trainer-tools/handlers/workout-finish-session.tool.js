const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { finishWorkoutSession } = require('../../services/workout-state.service');
const {
  workoutFinishSessionToolInputSchema,
  workoutFinishSessionToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_finish_session',
  category: 'workout execution',
  mutating: true,
  description: 'Close a live workout session with a final status and stored summary.',
  inputSchema: workoutFinishSessionToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutFinishSessionToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed finish-session payload.' });
    }

    throw error;
  }

  try {
    const workout = await finishWorkoutSession({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.finished',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          finalStatus: parsedInput.finalStatus,
          decision: parsedInput.decision,
          summary: parsedInput.summary || {}
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}`
      });
    } catch (error) {
      console.warn('Unable to append workout.finished audit event:', error.message);
    }

    return {
      status: 'ok',
      output: {
        workout
      }
    };
  } catch (error) {
    if (error && error.code === 'WORKOUT_NOT_FOUND') {
      return semanticError(
        'WORKOUT_NOT_FOUND',
        'The referenced workout session does not exist for this user.',
        'Use the current workout context in the prompt and retry against the correct workoutSessionId.',
        error.details || {}
      );
    }

    if (error && error.code === 'WORKOUT_NOT_ACTIVE') {
      return semanticError(
        'WORKOUT_NOT_ACTIVE',
        'Only a live workout can be finished through this tool.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    throw error;
  }
}

module.exports = {
  definition,
  execute
};
