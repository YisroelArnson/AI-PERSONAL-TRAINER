const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { skipWorkoutExercise } = require('../../services/workout-state.service');
const {
  workoutSkipExerciseToolInputSchema,
  workoutSkipExerciseToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_skip_exercise',
  category: 'workout execution',
  mutating: true,
  description: 'Skip the current exercise and advance the live workout to the next available exercise.',
  inputSchema: workoutSkipExerciseToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutSkipExerciseToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed skip-exercise payload.' });
    }

    throw error;
  }

  try {
    const workout = await skipWorkoutExercise({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.exercise.skipped',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          workoutExerciseId: parsedInput.workoutExerciseId || 'current'
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}:${parsedInput.workoutExerciseId || 'current'}`
      });
    } catch (error) {
      console.warn('Unable to append workout.exercise.skipped audit event:', error.message);
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
        'Only a live workout can skip an exercise.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_NOT_FOUND') {
      return semanticError(
        'EXERCISE_NOT_FOUND',
        'The referenced workout exercise does not belong to the current workout.',
        'Retry using the exact current workoutExerciseId from the workout context in the prompt.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_ALREADY_TERMINAL') {
      return semanticError(
        'EXERCISE_ALREADY_TERMINAL',
        'That exercise is already completed or skipped.',
        'Use the current workout context and continue from the next live exercise instead of skipping it again.',
        error.details || {}
      );
    }

    if (error && error.code === 'STALE_WORKOUT_STATE') {
      return semanticError(
        'STALE_WORKOUT_STATE',
        'The workout state advanced before this skip request was applied.',
        'Use the latest workout context in the prompt and retry only if the same exercise is still current.',
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
