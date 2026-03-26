const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { adjustWorkoutSetTargets } = require('../../services/workout-state.service');
const {
  workoutAdjustSetTargetsToolInputSchema,
  workoutAdjustSetTargetsToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_adjust_set_targets',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Change the exact stored targets for one or more unfinished sets on a workout exercise.',
  inputSchema: workoutAdjustSetTargetsToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutAdjustSetTargetsToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed set target adjustment payload.' });
    }

    throw error;
  }

  try {
    const workout = await adjustWorkoutSetTargets({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.targets.adjusted',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          workoutExerciseId: parsedInput.workoutExerciseId,
          setCount: parsedInput.setUpdates.length,
          decision: parsedInput.decision
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}`
      });
    } catch (error) {
      console.warn('Unable to append workout.targets.adjusted audit event:', error.message);
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
        'Only a live workout can have set targets adjusted.',
        'Load the current workout state again before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_NOT_FOUND') {
      return semanticError(
        'EXERCISE_NOT_FOUND',
        'The referenced workout exercise does not belong to this workout.',
        'Retry using the exact workoutExerciseId from workout_get_current_state.',
        error.details || {}
      );
    }

    if (error && error.code === 'SET_NOT_FOUND') {
      return semanticError(
        'SET_NOT_FOUND',
        'One of the requested set indexes does not exist on that exercise.',
        'Reload the current workout state and use valid set indexes from the current exercise.',
        error.details || {}
      );
    }

    if (error && error.code === 'SET_ALREADY_RECORDED') {
      return semanticError(
        'SET_ALREADY_RECORDED',
        'One of the requested sets is already completed or skipped, so its targets should not be rewritten.',
        'Adjust only unfinished sets or use workout_rewrite_remaining for broader changes.',
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
