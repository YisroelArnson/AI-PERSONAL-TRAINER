/**
 * File overview:
 * Implements the trainer tool handler for workout adjust set targets.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutAdjustSetTargetsToolInputSchema,
  workoutAdjustSetTargetsToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_adjust_set_targets',
  category: 'live workout adjustment',
  mutating: true,
  description: 'Change the exact stored targets for one or more unfinished sets on a workout exercise.',
  inputSchema: workoutAdjustSetTargetsToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
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
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: 'set.targets.adjust',
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        payload: {
          workoutExerciseId: parsedInput.workoutExerciseId,
          decision: parsedInput.decision,
          setUpdates: parsedInput.setUpdates,
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
        'Only a live workout can have set targets adjusted.',
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

    if (error && error.code === 'SET_NOT_FOUND') {
      return semanticError(
        'SET_NOT_FOUND',
        'One of the requested set indexes does not exist on that exercise.',
        'Use valid set indexes from the current workout context in the prompt.',
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
