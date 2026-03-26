const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { replaceWorkoutExerciseFromDraft } = require('../../services/workout-state.service');
const {
  workoutReplaceExerciseToolInputSchema,
  workoutReplaceExerciseToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_replace_exercise',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Replace one unfinished workout exercise with a fully authored new exercise plan.',
  inputSchema: workoutReplaceExerciseToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutReplaceExerciseToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed replacement payload.' });
    }

    throw error;
  }

  try {
    const workout = await replaceWorkoutExerciseFromDraft({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.exercise.replaced',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          workoutExerciseId: parsedInput.workoutExerciseId,
          replacementExerciseName: parsedInput.replacement.exerciseName,
          decision: parsedInput.decision
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}`
      });
    } catch (error) {
      console.warn('Unable to append workout.exercise.replaced audit event:', error.message);
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
        'Only a live workout can have an exercise replaced.',
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

    if (error && error.code === 'EXERCISE_ALREADY_TERMINAL') {
      return semanticError(
        'EXERCISE_ALREADY_TERMINAL',
        'That exercise is already completed, skipped, or canceled and cannot be replaced in place.',
        'Use workout_rewrite_remaining if you need to rewrite the unfinished workout from this point onward.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_ALREADY_STARTED') {
      return semanticError(
        'EXERCISE_ALREADY_STARTED',
        'That exercise already has performed set history, so replacing it in place would overwrite history.',
        'Use workout_rewrite_remaining instead so the completed history is preserved.',
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
