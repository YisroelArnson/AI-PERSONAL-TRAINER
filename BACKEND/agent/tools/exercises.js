// BACKEND/agent/tools/exercises.js
// Exercise and workout management tools
const { v4: uuidv4 } = require('uuid');
const exerciseDistributionService = require('../../services/exerciseDistribution.service');

// In-memory storage for current workout session
// In production, this would be stored in the session state
const workoutSessions = new Map();

const exerciseTools = {
  generate_workout: {
    description: 'Generate a workout with exercises based on user goals, preferences, and context. The exercises will be created directly by you.',
    statusMessage: {
      start: 'Creating your workout...',
      done: 'Workout ready'
    },
    parameters: {
      type: 'object',
      properties: {
        workout: {
          type: 'object',
          description: 'The workout object containing exercises array',
          properties: {
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['reps', 'hold', 'duration', 'intervals'] },
                  instructions: { type: 'string' },
                  categories: { type: 'array', items: { type: 'string' } },
                  muscles: { type: 'array', items: { type: 'string' } },
                  sets: { type: 'number' },
                  reps: { type: 'number' },
                  hold_time: { type: 'number' },
                  duration: { type: 'number' },
                  rounds: { type: 'number' },
                  work_time: { type: 'number' },
                  rest_time: { type: 'number' },
                  rest_between_sets: { type: 'number' }
                },
                required: ['name', 'type', 'categories', 'muscles']
              }
            },
            summary: {
              type: 'object',
              properties: {
                total_duration_estimate: { type: 'number' },
                focus_areas: { type: 'array', items: { type: 'string' } },
                difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] }
              }
            }
          },
          required: ['exercises']
        }
      },
      required: ['workout']
    },
    execute: async (args, context) => {
      const { userId, sessionId } = context;
      
      // Accept either { workout: { exercises } } or { exercises } directly
      const workout = args.workout || args;
      
      if (!workout.exercises || !Array.isArray(workout.exercises)) {
        return { 
          success: false, 
          error: 'Invalid workout format: exercises array is required' 
        };
      }

      // Assign unique IDs to each exercise
      const exercisesWithIds = workout.exercises.map(exercise => ({
        ...exercise,
        id: uuidv4()
      }));

      // Store in session
      workoutSessions.set(sessionId, {
        exercises: exercisesWithIds,
        summary: workout.summary,
        created_at: new Date().toISOString()
      });

      return {
        success: true,
        exercises: exercisesWithIds,
        summary: workout.summary,
        exercise_count: exercisesWithIds.length
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Workout generation failed: ${result.error}`;
      return `✓ ${result.exercise_count} exercises generated`;
    }
  },

  swap_exercise: {
    description: 'Replace an exercise in the current workout with a new one.',
    statusMessage: {
      start: 'Finding alternative...',
      done: 'Exercise swapped'
    },
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to replace'
        },
        new_exercise: {
          type: 'object',
          description: 'The new exercise to insert',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['reps', 'hold', 'duration', 'intervals'] },
            instructions: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            muscles: { type: 'array', items: { type: 'string' } },
            sets: { type: 'number' },
            reps: { type: 'number' },
            hold_time: { type: 'number' },
            duration: { type: 'number' },
            rounds: { type: 'number' },
            work_time: { type: 'number' },
            rest_time: { type: 'number' },
            rest_between_sets: { type: 'number' }
          },
          required: ['name', 'type', 'categories', 'muscles']
        },
        reason: {
          type: 'string',
          description: 'Reason for the swap'
        }
      },
      required: ['exercise_id', 'new_exercise']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const index = workout.exercises.findIndex(e => e.id === args.exercise_id);
      if (index === -1) {
        return { success: false, error: 'Exercise not found' };
      }

      const oldExercise = workout.exercises[index];
      const newExercise = { ...args.new_exercise, id: uuidv4() };
      workout.exercises[index] = newExercise;

      return {
        success: true,
        old_exercise: oldExercise.name,
        new_exercise: newExercise.name,
        new_id: newExercise.id
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Swap failed: ${result.error}`;
      return `Swapped "${result.old_exercise}" with "${result.new_exercise}"`;
    }
  },

  adjust_exercise: {
    description: 'Modify parameters of an existing exercise (sets, reps, duration, etc.).',
    statusMessage: {
      start: 'Adjusting exercise...',
      done: 'Exercise updated'
    },
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to modify'
        },
        adjustments: {
          type: 'object',
          description: 'Fields to update',
          additionalProperties: true
        }
      },
      required: ['exercise_id', 'adjustments']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const exercise = workout.exercises.find(e => e.id === args.exercise_id);
      if (!exercise) {
        return { success: false, error: 'Exercise not found' };
      }

      const oldValues = {};
      for (const [key, value] of Object.entries(args.adjustments)) {
        if (key !== 'id' && key !== 'type') { // Prevent changing id or type
          oldValues[key] = exercise[key];
          exercise[key] = value;
        }
      }

      return {
        success: true,
        exercise_name: exercise.name,
        adjustments: args.adjustments,
        old_values: oldValues
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Adjustment failed: ${result.error}`;
      const changes = Object.entries(result.adjustments)
        .map(([k, v]) => `${k}: ${result.old_values[k]} → ${v}`)
        .join(', ');
      return `Adjusted "${result.exercise_name}": ${changes}`;
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
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to remove'
        },
        reason: {
          type: 'string',
          description: 'Reason for removal'
        }
      },
      required: ['exercise_id']
    },
    execute: async (args, context) => {
      const { sessionId } = context;
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const index = workout.exercises.findIndex(e => e.id === args.exercise_id);
      if (index === -1) {
        return { success: false, error: 'Exercise not found' };
      }

      const removed = workout.exercises.splice(index, 1)[0];

      return {
        success: true,
        removed_exercise: removed.name,
        remaining_count: workout.exercises.length
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Removal failed: ${result.error}`;
      return `Removed "${result.removed_exercise}". ${result.remaining_count} exercises remaining.`;
    }
  },

  log_workout: {
    description: 'Log the completed workout to history and update exercise distribution.',
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
              exercise_id: { type: 'string' },
              completed: { type: 'boolean' },
              actual_sets: { type: 'number' },
              actual_reps: { type: 'number' },
              notes: { type: 'string' }
            },
            required: ['exercise_id', 'completed']
          },
          description: 'Array of completed exercise data'
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
      const workout = workoutSessions.get(sessionId);
      
      if (!workout) {
        return { success: false, error: 'No active workout session' };
      }

      const completedIds = new Set(
        args.completed_exercises
          .filter(e => e.completed)
          .map(e => e.exercise_id)
      );

      const completedExercises = workout.exercises.filter(e => completedIds.has(e.id));

      // Update exercise distribution for each completed exercise
      for (const exercise of completedExercises) {
        try {
          // Format exercise data for distribution service
          // The service expects goals_addressed and muscles_utilized
          const exerciseData = {
            goals_addressed: exercise.categories.map(cat => ({ goal: cat, share: 1 / exercise.categories.length })),
            muscles_utilized: exercise.muscles.map(muscle => ({ muscle, share: 1 / exercise.muscles.length }))
          };
          
          await exerciseDistributionService.updateTrackingIncrementally(userId, exerciseData);
        } catch (err) {
          console.error('Failed to update distribution:', err);
        }
      }

      // Clear the session workout
      workoutSessions.delete(sessionId);

      return {
        success: true,
        logged_count: completedExercises.length,
        total_in_workout: workout.exercises.length
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Logging failed: ${result.error}`;
      return `Logged ${result.logged_count}/${result.total_in_workout} exercises to history.`;
    }
  }
};

// Export session getter for other modules
function getWorkoutSession(sessionId) {
  return workoutSessions.get(sessionId);
}

module.exports = { exerciseTools, getWorkoutSession };
