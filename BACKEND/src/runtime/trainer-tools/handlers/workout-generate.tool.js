const { ZodError } = require('zod');

const { appendSessionEvent } = require('../../services/transcript-write.service');
const { createWorkoutSessionFromDraft } = require('../../services/workout-state.service');
const {
  parseWorkoutGenerateToolInput,
  workoutGenerateToolInputJsonSchema
} = require('../../schemas/workout-tool-contracts.schema');
const { semanticError, validationError } = require('./workout-tool.helpers');

const definition = {
  name: 'workout_generate',
  category: 'workout execution',
  mutating: true,
  description: 'Create a fully authored workout session. The agent chooses the exercises, sets, and targets; the backend stores the plan.',
  inputSchema: workoutGenerateToolInputJsonSchema
};

async function execute({ input, userId, run }) {
  let parsedInput;

  try {
    parsedInput = parseWorkoutGenerateToolInput(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(definition.name, error.issues[0] || { message: 'Malformed workout payload.' });
    }

    throw error;
  }

  try {
    const workout = await createWorkoutSessionFromDraft({
      userId,
      sessionKey: run.session_key,
      runId: run.run_id,
      input: parsedInput
    });

    try {
      await appendSessionEvent({
        userId,
        sessionKey: run.session_key,
        sessionId: run.session_id,
        eventType: 'workout.generated',
        actor: 'tool',
        runId: run.run_id,
        payload: {
          workoutSessionId: workout.workoutSessionId,
          title: workout.title,
          exerciseCount: workout.exercises.length,
          startMode: parsedInput.startMode,
          decision: parsedInput.decision
        },
        idempotencyKey: `${definition.name}:${run.run_id}:${workout.workoutSessionId}`
      });
    } catch (error) {
      console.warn('Unable to append workout.generated audit event:', error.message);
    }

    return {
      status: 'ok',
      output: {
        workout
      }
    };
  } catch (error) {
    if (error && error.code === 'ACTIVE_WORKOUT_EXISTS') {
      return semanticError(
        'ACTIVE_WORKOUT_EXISTS',
        'A live workout already exists for this user, so a second live workout cannot be created right now.',
        'Load the existing workout with workout_get_current_state or mutate the current workout instead of creating a second live workout.',
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
