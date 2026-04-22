/**
 * File overview:
 * Implements the trainer tool handler for workout session control.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { ZodError } = require('zod');

const { executeWorkoutCommand } = require('../../services/workout-command.service');
const {
  workoutSessionControlToolInputSchema,
  workoutSessionControlToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { mutationBusyError, semanticError, validationError } = require('./workout-tool.helpers');

const ACTION_HANDLERS = {
  start: {
    commandType: 'session.start'
  },
  pause: {
    commandType: 'session.pause'
  },
  resume: {
    commandType: 'session.resume'
  }
};

const definition = {
  name: 'workout_session_control',
  category: 'workout execution',
  mutating: true,
  description: 'Start, pause, or resume the current live workout session.',
  inputSchema: workoutSessionControlToolInputJsonSchema
};

/**
 * Executes the main action flow.
 */
async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = workoutSessionControlToolInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed workout session control payload.' });
    }

    throw error;
  }

  const actionHandler = ACTION_HANDLERS[parsedInput.action];

  try {
    const result = await executeWorkoutCommand({
      userId,
      command: {
        commandId: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}:${parsedInput.action}`,
        sessionKey: run.session_key,
        workoutSessionId: parsedInput.workoutSessionId,
        commandType: actionHandler.commandType,
        origin: {
          actor: 'agent',
          runId: run.run_id,
          occurredAt: run.started_at || run.created_at || new Date().toISOString()
        },
        baseStateVersion: parsedInput.expectedStateVersion,
        payload: {}
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
        'This workout cannot perform that session control action in its current state.',
        'Use the latest workout context in the prompt before choosing the next action.',
        error.details || {}
      );
    }

    if (error && error.code === 'STALE_WORKOUT_STATE') {
      return semanticError(
        'STALE_WORKOUT_STATE',
        'The workout state advanced before this session control action was applied.',
        'Use the latest workout context in the prompt and retry only if the same action is still appropriate.',
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
