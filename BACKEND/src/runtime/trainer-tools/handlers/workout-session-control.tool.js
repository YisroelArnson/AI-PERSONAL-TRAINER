const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const {
  pauseWorkoutSession,
  resumeWorkoutSession,
  startWorkoutSession
} = require('../../services/workout-state.service');
const {
  workoutSessionControlToolInputSchema,
  workoutSessionControlToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const ACTION_HANDLERS = {
  start: {
    eventType: 'workout.started',
    execute: startWorkoutSession
  },
  pause: {
    eventType: 'workout.paused',
    execute: pauseWorkoutSession
  },
  resume: {
    eventType: 'workout.resumed',
    execute: resumeWorkoutSession
  }
};

const definition = {
  name: 'workout_session_control',
  category: 'workout execution',
  mutating: true,
  description: 'Start, pause, or resume the current live workout session.',
  inputSchema: workoutSessionControlToolInputJsonSchema
};

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
    const workout = await actionHandler.execute({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: actionHandler.eventType,
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          action: parsedInput.action
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutSessionId}:${parsedInput.action}`
      });
    } catch (error) {
      console.warn('Unable to append workout session control audit event:', error.message);
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
