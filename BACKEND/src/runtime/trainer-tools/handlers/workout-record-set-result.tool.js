/**
 * File overview:
 * Implements the trainer tool handler for workout record set result.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutRecordSetResultToolInputSchema,
  workoutRecordSetResultToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_record_set_result',
  category: 'workout execution',
  mutating: true,
  description: 'Record what the user just did for one set and update the live workout pointers and phase.',
  inputSchema: workoutRecordSetResultToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutRecordSetResultToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed set result payload.' });
    }

    throw error;
  }

  try {
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}:${parsedInput.setIndex}:${parsedInput.resultStatus}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: parsedInput.resultStatus === 'completed' ? 'set.complete' : 'set.skip',
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        baseStateVersion: parsedInput.expectedStateVersion,
        payload: parsedInput.resultStatus === 'completed'
          ? {
              workoutExerciseId: parsedInput.workoutExerciseId,
              setIndex: parsedInput.setIndex,
              actual: parsedInput.actual || {},
              userNote: parsedInput.userNote || null
            }
          : {
              workoutExerciseId: parsedInput.workoutExerciseId
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
        'Use the latest workout context in the prompt before deciding the next action.',
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
        'The referenced workout session is no longer live, so set results cannot be recorded into it.',
        'Use the latest workout context in the prompt before deciding the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'EXERCISE_NOT_FOUND') {
      return semanticError(
        'EXERCISE_NOT_FOUND',
        'The referenced workout exercise does not belong to the workout session.',
        'Retry using the exact workoutExerciseId from the current workout context in the prompt.',
        error.details || {}
      );
    }

    if (error && error.code === 'SET_NOT_FOUND') {
      return semanticError(
        'SET_NOT_FOUND',
        'The referenced setIndex does not exist on that workout exercise.',
        'Reload the workout state and use a valid setIndex from the current exercise.',
        error.details || {}
      );
    }

    if (error && error.code === 'SET_ALREADY_RECORDED') {
      return semanticError(
        'SET_ALREADY_RECORDED',
        'That set was already recorded earlier in this workout.',
        'Use the current workout context and continue from the next live set instead of recording this one again.',
        error.details || {}
      );
    }

    if (error && error.code === 'CONFLICT_USER_PRIORITY') {
      return semanticError(
        'CONFLICT_USER_PRIORITY',
        'A newer user action already changed this workout, so the agent command was not applied.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'INVALID_FLOW_DIRECTIVE') {
      return semanticError(
        'INVALID_FLOW_DIRECTIVE',
        'The requested next workout pointer or phase does not match the stored workout structure.',
        'Retry with a valid currentExerciseIndex/currentSetIndex pair from the current workout context in the prompt.',
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
