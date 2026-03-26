const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { rewriteRemainingWorkoutFromDraft } = require('../../services/workout-state.service');
const {
  workoutRewriteRemainingToolInputSchema,
  workoutRewriteRemainingToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_rewrite_remaining',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Replace the unfinished portion of the current workout with a fully authored new remaining plan.',
  inputSchema: workoutRewriteRemainingToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutRewriteRemainingToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed rewrite payload.' });
    }

    throw error;
  }

  try {
    const workout = await rewriteRemainingWorkoutFromDraft({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.rewritten',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          replacementExerciseCount: parsedInput.remainingExercises.length,
          decision: parsedInput.decision
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}`
      });
    } catch (error) {
      console.warn('Unable to append workout.rewritten audit event:', error.message);
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
        'Read the current workout state first and retry against the returned workoutSessionId.',
        error.details || {}
      );
    }

    if (error && error.code === 'WORKOUT_NOT_ACTIVE') {
      return semanticError(
        'WORKOUT_NOT_ACTIVE',
        'Only a live workout can have its remaining plan rewritten.',
        'Load the current workout state again before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'NO_REMAINING_WORKOUT_TO_REWRITE') {
      return semanticError(
        'NO_REMAINING_WORKOUT_TO_REWRITE',
        'There is no unfinished part of this workout left to rewrite.',
        'Finish the workout or use workout_get_current_state to confirm what is still live.',
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
