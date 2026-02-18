// BACKEND/agent/tools/exercises.js
// Exercise and workout management tools — unified through trainerWorkouts service
const workoutService = require('../../services/trainerWorkouts.service');
const sessionObs = require('../../services/sessionObservability.service');

// Maps agent chat sessionId -> workout sessionId
// Lightweight reference; all exercise state lives in the DB via the workout service
const agentWorkoutSessions = new Map();

const exerciseTools = {
  generate_workout: {
    description: 'Generate a personalized workout based on the user\'s active training program, location, and time constraints. Creates an artifact that must be delivered to the user via message_notify_user with the artifact_id.',
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
        // Create a workout session via the service
        const workoutSession = await workoutService.getOrCreateSession(userId, {
          forceNew: true,
          metadata: { source: 'agent', agent_session_id: sessionId }
        });

        // Build constraints from agent inputs
        const constraints = {
          intent: args.intent || 'custom',
          request_text: args.request_text || null,
          time_available_min: args.time_available_min || null
        };

        // Generate workout via the unified service (includes active program, user context)
        const instance = await workoutService.generateWorkoutInstance(userId, constraints);
        const instanceRecord = await workoutService.createWorkoutInstance(workoutSession.id, instance);

        // Log the generation event
        await workoutService.logEvent(workoutSession.id, workoutService.EVENT_TYPES.instanceGenerated, {
          constraints,
          version: instanceRecord.version,
          source: 'agent',
          timestamp: new Date().toISOString()
        });

        // Store mapping for swap/adjust/remove operations
        agentWorkoutSessions.set(sessionId, {
          workoutSessionId: workoutSession.id
        });

        // Create artifact for agent UI delivery
        const artifact = {
          type: 'exercise_list',
          schema_version: '1.0',
          title: instance.title || 'Your Workout',
          summary: {
            duration_min: instance.estimated_duration_min || null,
            focus: instance.focus || [],
            exercise_count: instance.exercises.length
          },
          auto_start: false,
          payload: {
            exercises: instance.exercises,
            workout_session_id: workoutSession.id
          }
        };

        const { artifact_id } = await sessionObs.logArtifact(sessionId, artifact);

        return {
          success: true,
          artifact_id,
          exercise_count: instance.exercises.length,
          workout_session_id: workoutSession.id,
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
    statusMessage: {
      start: 'Finding alternative...',
      done: 'Exercise swapped'
    },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: {
          type: 'integer',
          description: 'Index of the exercise to replace (0-based)'
        },
        reason: {
          type: 'string',
          description: 'Why the exercise should be replaced (e.g., "equipment not available", "causes shoulder pain")'
        }
      },
      required: ['exercise_index']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workoutRef = agentWorkoutSessions.get(sessionId);

      if (!workoutRef) {
        return { success: false, error: 'No active workout session. Generate a workout first.' };
      }

      try {
        // Get current exercise name for the response
        const latestInstance = await workoutService.getLatestInstance(workoutRef.workoutSessionId);
        const exercises = latestInstance?.instance_json?.exercises || [];
        const oldExercise = exercises[args.exercise_index];

        if (!oldExercise) {
          return {
            success: false,
            error: `Invalid exercise index ${args.exercise_index}. Workout has ${exercises.length} exercises (0-${exercises.length - 1}).`
          };
        }

        const result = await workoutService.applyAction({
          sessionId: workoutRef.workoutSessionId,
          userId,
          actionType: 'swap_exercise',
          payload: { index: args.exercise_index, reason: args.reason }
        });

        const newExercise = result.instance?.exercises?.[args.exercise_index];

        return {
          success: true,
          old_exercise: oldExercise.exercise_name,
          new_exercise: newExercise?.exercise_name || 'replacement',
          instance_updated: result.instanceUpdated
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Swap failed: ${result.error}`;
      return `Swapped "${result.old_exercise}" with "${result.new_exercise}"`;
    }
  },

  adjust_exercise: {
    description: 'Adjust the difficulty of an exercise (make it easier or harder).',
    statusMessage: {
      start: 'Adjusting exercise...',
      done: 'Exercise updated'
    },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: {
          type: 'integer',
          description: 'Index of the exercise to adjust (0-based)'
        },
        direction: {
          type: 'string',
          enum: ['easier', 'harder'],
          description: 'Whether to make the exercise easier or harder'
        }
      },
      required: ['exercise_index', 'direction']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workoutRef = agentWorkoutSessions.get(sessionId);

      if (!workoutRef) {
        return { success: false, error: 'No active workout session. Generate a workout first.' };
      }

      try {
        const result = await workoutService.applyAction({
          sessionId: workoutRef.workoutSessionId,
          userId,
          actionType: 'adjust_prescription',
          payload: { index: args.exercise_index, direction: args.direction }
        });

        const exercise = result.instance?.exercises?.[args.exercise_index];

        return {
          success: true,
          exercise_name: exercise?.exercise_name || 'exercise',
          direction: args.direction,
          instance_updated: result.instanceUpdated
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Adjustment failed: ${result.error}`;
      return `Made "${result.exercise_name}" ${result.direction}`;
    }
  },

  remove_exercise: {
    description: 'Remove an exercise from the current workout.',
    statusMessage: {
      start: 'Removing exercise...',
      done: 'Exercise removed'
    },
    parameters: {
      type: 'object',
      properties: {
        exercise_index: {
          type: 'integer',
          description: 'Index of the exercise to remove (0-based)'
        },
        reason: {
          type: 'string',
          description: 'Reason for removal'
        }
      },
      required: ['exercise_index']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workoutRef = agentWorkoutSessions.get(sessionId);

      if (!workoutRef) {
        return { success: false, error: 'No active workout session. Generate a workout first.' };
      }

      try {
        const latestInstance = await workoutService.getLatestInstance(workoutRef.workoutSessionId);
        const instanceJson = latestInstance?.instance_json;

        if (!instanceJson?.exercises) {
          return { success: false, error: 'No exercises found in workout' };
        }

        const exercises = [...instanceJson.exercises];
        if (args.exercise_index < 0 || args.exercise_index >= exercises.length) {
          return {
            success: false,
            error: `Invalid exercise index ${args.exercise_index}. Workout has ${exercises.length} exercises (0-${exercises.length - 1}).`
          };
        }

        const removed = exercises.splice(args.exercise_index, 1)[0];
        const updatedInstance = { ...instanceJson, exercises };
        await workoutService.createWorkoutInstance(workoutRef.workoutSessionId, updatedInstance);

        await workoutService.logEvent(workoutRef.workoutSessionId, workoutService.EVENT_TYPES.action, {
          action_type: 'remove_exercise',
          payload: { index: args.exercise_index, reason: args.reason },
          removed_exercise: removed.exercise_name,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          removed_exercise: removed.exercise_name,
          remaining_count: exercises.length
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Removal failed: ${result.error}`;
      return `Removed "${result.removed_exercise}". ${result.remaining_count} exercises remaining.`;
    }
  },

  log_workout: {
    description: 'Log the completed workout to history.',
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
      },
      required: ['completed_exercises']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      const workoutRef = agentWorkoutSessions.get(sessionId);

      if (!workoutRef) {
        return { success: false, error: 'No active workout session' };
      }

      try {
        const logPayload = {
          completed_exercises: args.completed_exercises,
          workout_notes: args.workout_notes || null
        };

        await workoutService.saveWorkoutLog(workoutRef.workoutSessionId, logPayload);

        const completedCount = args.completed_exercises.filter(e => e.completed).length;

        // Clean up agent session mapping
        agentWorkoutSessions.delete(sessionId);

        return {
          success: true,
          logged_count: completedCount,
          total_in_workout: args.completed_exercises.length
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) return `Logging failed: ${result.error}`;
      return `Logged ${result.logged_count}/${result.total_in_workout} exercises to history.`;
    }
  }
};

// Get workout session reference for an agent session
function getWorkoutSession(sessionId) {
  return agentWorkoutSessions.get(sessionId) || null;
}

module.exports = { exerciseTools, getWorkoutSession };
