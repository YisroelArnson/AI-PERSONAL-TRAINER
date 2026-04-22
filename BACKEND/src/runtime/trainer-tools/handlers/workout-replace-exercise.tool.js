/**
 * File overview:
 * Implements the trainer tool handler for workout replace exercise.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutReplaceExerciseToolInputSchema,
  workoutReplaceExerciseToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_replace_exercise',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Replace one unfinished workout exercise with a fully authored new exercise plan.',
  inputSchema: workoutReplaceExerciseToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
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
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: 'exercise.replace',
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        payload: {
          workoutExerciseId: parsedInput.workoutExerciseId,
          decision: parsedInput.decision,
          replacement: parsedInput.replacement,
          flow: parsedInput.flow || {}
        }
      },
      runContext: {
        runId: run.run_id,
        sessionId: run.session_id,
        sessionKey: run.session_key,
        createdAt: run.created_at,
        startedAt: run.started_at
      }
    });

    if (result.command.status === 'rejected') {
      return semanticError(
        result.command.conflict && result.command.conflict.code
          ? result.command.conflict.code
          : 'WORKOUT_COMMAND_REJECTED',
        result.command.conflict && result.command.conflict.message
          ? result.command.conflict.message
          : 'The workout command could not be applied.',
        'Use the latest workout context in the prompt before choosing the next action.',
        result.command.conflict || {}
      );
    }

    return {
      status: 'ok',
      output: {
        workout: result.workout,
        command: result.command
      }
    };
  } catch (error) {
    const busyError = mutationBusyError(error);

    if (busyError) {
      return busyError;
    }

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
        'Only a live workout can have an exercise replaced.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_NOT_FOUND') {
      return semanticError(
        'EXERCISE_NOT_FOUND',
        'The referenced workout exercise does not belong to this workout.',
        'Retry using the exact workoutExerciseId from the current workout context in the prompt.',
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
