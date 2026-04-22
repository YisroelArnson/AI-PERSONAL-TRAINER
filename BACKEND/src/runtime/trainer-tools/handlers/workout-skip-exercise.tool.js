/**
 * File overview:
 * Implements the trainer tool handler for workout skip exercise.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutSkipExerciseToolInputSchema,
  workoutSkipExerciseToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_skip_exercise',
  category: 'workout execution',
  mutating: true,
  description: 'Skip the current exercise and advance the live workout to the next available exercise.',
  inputSchema: workoutSkipExerciseToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
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
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}:${parsedInput.workoutExerciseId || 'current'}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: 'exercise.skip',
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        baseStateVersion: parsedInput.expectedStateVersion,
        payload: {
          workoutExerciseId: parsedInput.workoutExerciseId || 'current'
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
