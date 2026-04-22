/**
 * File overview:
 * Implements the trainer tool handler for workout rewrite remaining.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutRewriteRemainingToolInputSchema,
  workoutRewriteRemainingToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_rewrite_remaining',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Replace the unfinished portion of the current workout with a fully authored new remaining plan.',
  inputSchema: workoutRewriteRemainingToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
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
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: 'workout.remaining.rewrite',
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        payload: {
          decision: parsedInput.decision,
          title: parsedInput.title || null,
          guidance: parsedInput.guidance || {},
          remainingExercises: parsedInput.remainingExercises,
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
        'Only a live workout can have its remaining plan rewritten.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'NO_REMAINING_WORKOUT_TO_REWRITE') {
      return semanticError(
        'NO_REMAINING_WORKOUT_TO_REWRITE',
        'There is no unfinished part of this workout left to rewrite.',
        'Finish the workout or inspect the current workout context in the prompt to confirm what is still live.',
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
