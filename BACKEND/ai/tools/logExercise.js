const { tool } = require('ai');
const { z } = require('zod');

/**
 * Tool for logging completed exercises
 * @param {string} userId - The user ID for context
 * @returns {Object} Tool definition for AI SDK
 */
function createLogExerciseTool(userId) {
  return tool({
    description: 'Log a completed exercise or workout for the user. Extract exercise details from the user message - if they say "I did 15 pushups", extract exerciseName="pushups" and reps=15. If they mention sets like "3 sets of 10 squats", extract sets=3, reps=10, exerciseName="squats".',
    parameters: z.object({
      exerciseName: z.string().optional().describe('The name of the exercise that was completed (e.g., "pushups", "squats", "bench press")'),
      duration: z.number().optional().describe('Duration of the exercise in minutes'),
      sets: z.number().optional().describe('Number of sets completed'),
      reps: z.number().optional().describe('Number of repetitions per set'),
      weights: z.array(z.number()).optional().describe('Array of weights used for each set, in pounds or kilograms'),
      notes: z.string().optional().describe('Additional notes about the exercise session')
    }),
    execute: async ({ exerciseName, duration, sets, reps, weights, notes }) => {
      console.log(`Logging exercise for user ${userId}:`, {
        exerciseName,
        duration,
        sets,
        reps,
        weights,
        notes
      });
      
      // Validate that we have at least an exercise name
      if (!exerciseName) {
        console.log('Warning: No exercise name provided in tool call');
        return {
          success: false,
          message: 'Unable to log exercise - no exercise name provided',
          error: 'Missing exercise name'
        };
      }
      
      // Create exercise log entry
      const exerciseLog = {
        userId,
        exerciseName,
        duration,
        sets,
        reps,
        weights,
        notes,
        completedAt: new Date().toISOString(),
        logId: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Here you would typically save to your database
      // For now, we'll just return the logged data
      console.log('Exercise logged successfully:', exerciseLog);
      
      return {
        success: true,
        message: `Successfully logged ${exerciseName}`,
        exerciseLog
      };
    },
  });
}

module.exports = { createLogExerciseTool };
