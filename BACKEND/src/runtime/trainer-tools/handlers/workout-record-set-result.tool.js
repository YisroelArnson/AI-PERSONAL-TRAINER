const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { recordWorkoutSetResult } = require('../../services/workout-state.service');
const {
  workoutRecordSetResultToolInputSchema,
  workoutRecordSetResultToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_record_set_result',
  category: 'workout execution',
  mutating: true,
  description: 'Record what the user just did for one set and update the live workout pointers and phase.',
  inputSchema: workoutRecordSetResultToolInputJsonSchema
};

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
    const result = await recordWorkoutSetResult({
      userId,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: parsedInput.resultStatus === 'completed'
          ? 'workout.set.completed'
          : 'workout.set.skipped',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: parsedInput.workoutSessionId,
          workoutExerciseId: parsedInput.workoutExerciseId,
          setIndex: parsedInput.setIndex,
          decision: parsedInput.decision,
          currentPhase: result.workout.currentPhase,
          currentExerciseId: result.workout.currentExerciseId
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${parsedInput.workoutExerciseId}:${parsedInput.setIndex}`
      });
    } catch (error) {
      console.warn('Unable to append workout set audit event:', error.message);
    }

    return {
      status: 'ok',
      output: {
        workout: result.workout
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
