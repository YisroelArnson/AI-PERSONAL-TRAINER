// BACKEND/agent/tools/exercises.js
// Exercise and workout management tools backed by workout tracking V2
const workoutTrackingService = require('../../services/workoutTrackingV2.service');
const sessionObs = require('../../services/sessionObservability.service');

// Maps agent chat sessionId -> workout sessionId
const agentWorkoutSessions = new Map();

function unsupportedMutationResult(feature) {
  return {
    success: false,
    error: `${feature} is not available in the V2 command API yet.`
  };
}

const exerciseTools = {
  generate_workout: {
    description: 'Generate a personalized workout and create an artifact the user can view.',
    statusMessage: {
      start: 'Creating your workout...',
      done: 'Workout ready'
    },
    parameters: {
      type: 'object',
      properties: {
        request_text: {
          type: 'string',
          description: 'What the user wants to work on (natural language request from conversation)'
        },
        time_available_min: {
          type: 'integer',
          description: 'How many minutes the user has available'
        },
        intent: {
          type: 'string',
          enum: ['planned', 'custom', 'user_specified'],
          description: 'Type of workout session'
        }
      }
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;

      try {
        const detail = await workoutTrackingService.createWorkoutSession({
          userId,
          requestBody: {
            intent: args.intent || 'custom',
            request_text: args.request_text || null,
            time_available_min: args.time_available_min || null,
            metadata: { source: 'agent', agent_session_id: sessionId }
          }
        });

        agentWorkoutSessions.set(sessionId, {
          workoutSessionId: detail.session.id
        });

        const instance = detail.instance || { title: detail.workout?.title || 'Your Workout', exercises: [] };

        const artifact = {
          type: 'exercise_list',
          schema_version: '1.0',
          title: instance.title || 'Your Workout',
          summary: {
            duration_min: instance.estimated_duration_min || detail.workout?.planned_duration_min || null,
            focus: instance.focus || [],
            exercise_count: instance.exercises?.length || 0
          },
          auto_start: false,
          payload: {
            exercises: instance.exercises || [],
            workout_session_id: detail.session.id
          }
        };

        const { artifact_id } = await sessionObs.logArtifact(sessionId, artifact);

        return {
          success: true,
          artifact_id,
          exercise_count: artifact.summary.exercise_count,
          workout_session_id: detail.session.id,
          summary: artifact.summary
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Workout generation failed: ${result.error}`;
      return `Workout artifact created (${result.exercise_count} exercises). Artifact ID: ${result.artifact_id}. IMPORTANT: You MUST now call message_notify_user with artifact_id="${result.artifact_id}" to deliver this workout to the user. The user cannot see the workout until you do this.`;
    }
  },

  swap_exercise: {
    description: 'Replace an exercise in the current workout with an AI-generated alternative.',
    statusMessage: { start: 'Finding alternative...', done: 'Exercise swapped' },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: { type: 'integer', description: 'Index of the exercise to replace (0-based)' },
        reason: { type: 'string', description: 'Why the exercise should be replaced' }
      },
      required: ['exercise_index']
    },
    execute: async () => unsupportedMutationResult('swap_exercise'),
    formatResult: (result) => {
      if (!result.success) return `Swap failed: ${result.error}`;
      return 'Swap complete';
    }
  },

  adjust_exercise: {
    description: 'Adjust the difficulty of an exercise (make it easier or harder).',
    statusMessage: { start: 'Adjusting exercise...', done: 'Exercise updated' },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: { type: 'integer', description: 'Index of the exercise to adjust (0-based)' },
        direction: {
          type: 'string',
          enum: ['easier', 'harder'],
          description: 'Whether to make the exercise easier or harder'
        }
      },
      required: ['exercise_index', 'direction']
    },
    execute: async () => unsupportedMutationResult('adjust_exercise'),
    formatResult: (result) => {
      if (!result.success) return `Adjustment failed: ${result.error}`;
      return 'Adjustment complete';
    }
  },

  remove_exercise: {
    description: 'Remove an exercise from the current workout.',
    statusMessage: { start: 'Removing exercise...', done: 'Exercise removed' },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: { type: 'integer', description: 'Index of the exercise to remove (0-based)' },
        reason: { type: 'string', description: 'Reason for removal' }
      },
      required: ['exercise_index']
    },
    execute: async () => unsupportedMutationResult('remove_exercise'),
    formatResult: (result) => {
      if (!result.success) return `Removal failed: ${result.error}`;
      return 'Exercise removed.';
    }
  },

  log_workout: {
    description: 'Finalize and log the active workout session.',
    statusMessage: {
      start: 'Saving your workout...',
      done: 'Workout logged'
    },
    parameters: {
      type: 'object',
      properties: {
        completed_exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exercise_index: { type: 'integer', description: 'Index of the exercise (0-based)' },
              completed: { type: 'boolean' },
              notes: { type: 'string' }
            },
            required: ['exercise_index', 'completed']
          },
          description: 'Array of exercise completion data'
        },
        workout_notes: {
          type: 'string',
          description: 'Overall workout notes'
        }
      }
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workoutRef = agentWorkoutSessions.get(sessionId);

      if (!workoutRef) {
        return { success: false, error: 'No active workout session' };
      }

      try {
        const completedCount = Array.isArray(args.completed_exercises)
          ? args.completed_exercises.filter(e => e.completed).length
          : 0;

        const summary = await workoutTrackingService.finalizeSession({
          userId,
          sessionId: workoutRef.workoutSessionId,
          reflection: {
            notes: args.workout_notes || null
          },
          mode: 'complete'
        });

        agentWorkoutSessions.delete(sessionId);

        return {
          success: true,
          logged_count: completedCount,
          summary
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Logging failed: ${result.error}`;
      return `Workout logged. ${result.logged_count} exercises marked complete.`;
    }
  }
};

function getWorkoutSession(sessionId) {
  return agentWorkoutSessions.get(sessionId) || null;
}

module.exports = { exerciseTools, getWorkoutSession };
