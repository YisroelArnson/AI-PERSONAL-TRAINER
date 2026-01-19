// BACKEND/agent/tools/exercises.js
// Exercise and workout management tools for the 4-type exercise system
const { v4: uuidv4 } = require('uuid');
const exerciseDistributionService = require('../../services/exerciseDistribution.service');
const sessionObs = require('../../services/sessionObservability.service');

// Valid muscles (16 preset)
const VALID_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs',
  'Lower Back', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves',
  'Trapezius', 'Abductors', 'Adductors', 'Forearms', 'Neck'
];

// Group types for circuits, supersets, etc.
const GROUP_TYPES = ['circuit', 'superset', 'giant_set', 'warmup', 'cooldown', 'sequence'];

// Exercise types (4 core types)
const EXERCISE_TYPES = ['reps', 'hold', 'duration', 'intervals'];

// In-memory storage for current workout session
// In production, this would be stored in the session state
const workoutSessions = new Map();

const exerciseTools = {
  generate_workout: {
    description: 'Generate a workout with exercises. Creates an artifact that must be delivered to the user via message_notify_user with the artifact_id.',
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
                  // === IDENTITY & ORDERING ===
                  exercise_name: { type: 'string', description: 'Name of the exercise' },
                  exercise_type: {
                    type: 'string',
                    enum: EXERCISE_TYPES,
                    description: 'Type: "reps" (set/rep based), "hold" (isometric), "duration" (continuous), "intervals" (work/rest cycles)'
                  },
                  order: { type: 'integer', description: 'Position in workout (1-indexed)' },

                  // === GROUPING (optional - for circuits, supersets, etc.) ===
                  group: {
                    type: 'object',
                    description: 'Optional grouping for circuits, supersets, etc.',
                    properties: {
                      id: { type: 'string', description: 'Unique group identifier (e.g., "circuit-1", "superset-a")' },
                      type: { type: 'string', enum: GROUP_TYPES, description: 'How to execute the group' },
                      position: { type: 'integer', description: 'Order within group (1-indexed)' },
                      name: { type: 'string', description: 'Display name (set on first exercise only)' },
                      rounds: { type: 'integer', description: 'Times to repeat group (set on first exercise only)' },
                      rest_between_rounds_sec: { type: 'integer', description: 'Rest after completing group' }
                    },
                    required: ['id', 'type', 'position']
                  },

                  // === METADATA (required) ===
                  muscles_utilized: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        muscle: { type: 'string', enum: VALID_MUSCLES, description: 'Muscle name' },
                        share: { type: 'number', description: 'Utilization share 0.0-1.0 (all shares must sum to ~1.0)' }
                      },
                      required: ['muscle', 'share']
                    },
                    description: 'Muscles worked with utilization percentages (shares must sum to 1.0)'
                  },
                  goals_addressed: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        goal: { type: 'string', description: 'Goal category (e.g., "strength", "endurance", "flexibility")' },
                        share: { type: 'number', description: 'How much this exercise addresses the goal 0.0-1.0 (shares must sum to ~1.0)' }
                      },
                      required: ['goal', 'share']
                    },
                    description: 'Fitness goals this exercise addresses (shares must sum to 1.0)'
                  },
                  reasoning: { type: 'string', maxLength: 300, description: 'Brief explanation for this exercise selection' },
                  exercise_description: { type: 'string', description: 'Instructions on how to perform the exercise' },
                  equipment: { type: 'array', items: { type: 'string' }, description: 'Equipment needed' },

                  // === TYPE: reps - Count repetitions across sets (strength, bodyweight) ===
                  sets: { type: 'integer', description: '[reps, hold] Number of sets' },
                  reps: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: '[reps] Target reps per set (array, e.g., [10, 10, 8])'
                  },
                  load_each: {
                    type: 'array',
                    items: { type: 'number' },
                    description: '[reps] Weight per set (array, e.g., [20, 20, 25]). Null for bodyweight.'
                  },
                  load_unit: {
                    type: 'string',
                    enum: ['lbs', 'kg'],
                    description: '[reps] Weight unit (lbs or kg)'
                  },

                  // === TYPE: hold - Hold positions for time (isometric, balance, static stretches) ===
                  hold_sec: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: '[hold] Hold duration per set in seconds (array, e.g., [30, 30, 30])'
                  },

                  // === TYPE: duration - Continuous effort (cardio, yoga flows) ===
                  duration_min: { type: 'number', description: '[duration] Total duration in minutes' },
                  distance: { type: 'number', description: '[duration] Target distance (optional)' },
                  distance_unit: {
                    type: 'string',
                    enum: ['km', 'mi'],
                    description: '[duration] Distance unit (km or mi)'
                  },
                  target_pace: { type: 'string', description: '[duration] Target pace (e.g., "5:30/km")' },

                  // === TYPE: intervals - Work/rest cycles (HIIT, tabata) ===
                  rounds: { type: 'integer', description: '[intervals] Number of rounds' },
                  work_sec: { type: 'integer', description: '[intervals] Work interval in seconds' },

                  // === SHARED TIMING ===
                  rest_sec: { type: 'integer', description: '[reps, hold, intervals] Rest between sets/intervals in seconds' }
                },
                required: ['exercise_name', 'exercise_type', 'order', 'muscles_utilized', 'goals_addressed', 'reasoning']
              }
            },
            summary: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                estimated_duration_min: { type: 'number', description: 'Estimated total workout duration' },
                primary_goals: { type: 'array', items: { type: 'string' } },
                muscles_targeted: { type: 'array', items: { type: 'string' } },
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

      // Build artifact object
      const artifact = {
        type: 'exercise_list',
        schema_version: '1.0',
        title: workout.summary?.title || 'Your Workout',
        summary: {
          duration_min: workout.summary?.total_duration_estimate || null,
          focus: workout.summary?.focus_areas || [],
          difficulty: workout.summary?.difficulty || 'intermediate',
          exercise_count: exercisesWithIds.length
        },
        auto_start: false,
        payload: {
          exercises: exercisesWithIds,
          summary: workout.summary
        }
      };

      // Log artifact to session events
      const { artifact_id } = await sessionObs.logArtifact(sessionId, artifact);

      // Store in memory for swap/adjust/remove operations
      workoutSessions.set(sessionId, {
        exercises: exercisesWithIds,
        summary: workout.summary,
        artifact_id: artifact_id,
        created_at: new Date().toISOString()
      });

      return {
        success: true,
        artifact_id: artifact_id,
        exercise_count: exercisesWithIds.length,
        summary: artifact.summary
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Workout generation failed: ${result.error}`;
      return `Workout artifact created (${result.exercise_count} exercises). Artifact ID: ${result.artifact_id}. IMPORTANT: You MUST now call message_notify_user with artifact_id="${result.artifact_id}" to deliver this workout to the user. The user cannot see the workout until you do this.`;
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
          description: 'The new exercise to insert (same format as generate_workout exercises)',
          properties: {
            exercise_name: { type: 'string' },
            exercise_type: { type: 'string', enum: EXERCISE_TYPES },
            order: { type: 'integer' },
            group: { type: 'object' },
            muscles_utilized: { type: 'array', items: { type: 'object', properties: { muscle: { type: 'string' }, share: { type: 'number' } } } },
            goals_addressed: { type: 'array', items: { type: 'object', properties: { goal: { type: 'string' }, share: { type: 'number' } } } },
            exercise_description: { type: 'string' },
            reasoning: { type: 'string' },
            equipment: { type: 'array', items: { type: 'string' } },
            // Type: reps
            sets: { type: 'integer' },
            reps: { type: 'array', items: { type: 'integer' } },
            load_each: { type: 'array', items: { type: 'number' } },
            load_unit: { type: 'string', enum: ['lbs', 'kg'] },
            // Type: hold
            hold_sec: { type: 'array', items: { type: 'integer' } },
            // Type: duration
            duration_min: { type: 'number' },
            distance: { type: 'number' },
            distance_unit: { type: 'string', enum: ['km', 'mi'] },
            target_pace: { type: 'string' },
            // Type: intervals
            rounds: { type: 'integer' },
            work_sec: { type: 'integer' },
            // Shared
            rest_sec: { type: 'integer' }
          },
          required: ['exercise_name', 'exercise_type', 'order', 'muscles_utilized', 'goals_addressed', 'reasoning']
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
        old_exercise: oldExercise.exercise_name,
        new_exercise: newExercise.exercise_name,
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
          // Use the exercise's goals_addressed and muscles_utilized directly
          // These are already in the correct format from generate_workout
          const exerciseData = {
            goals_addressed: exercise.goals_addressed || [],
            muscles_utilized: exercise.muscles_utilized || []
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
