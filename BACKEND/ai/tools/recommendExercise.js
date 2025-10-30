const { tool } = require('ai');
const { z } = require('zod');
const { generateExerciseRecommendations, streamExerciseRecommendations } = require('../../services/recommend.service');
const { cleanupPreferences } = require('./parsePreference');

/**
 * Tool for generating personalized exercise recommendations
 * @param {string} userId - The user ID for context
 * @param {Object} options - Additional options
 * @param {boolean} options.enableStreaming - Whether to enable streaming mode
 * @param {Function} options.onExercise - Callback for each streamed exercise
 * @returns {Object} Tool definition for AI SDK
 */
function createRecommendExerciseTool(userId, options = {}) {
  return tool({
    description: 'Generate personalized exercise recommendations for a user based on their input and user ID.',
    parameters: z.object({
      exerciseCount: z.number().optional().describe('Number of exercises to generate (default: 8)'),
      preferences: z.string().optional().describe('Any specific preferences or requirements from the user')
    }),
    execute: async ({ exerciseCount = 8, preferences }) => {
      console.log(`Generating ${exerciseCount} exercise recommendations for user ${userId}`);
      
      const requestData = { 
        exerciseCount,
        explicitPreferences: preferences ? [preferences] : undefined
      };

      // If streaming is enabled, use the streaming service
      if (options.enableStreaming && options.onExercise) {
        try {
          const streamResult = await streamExerciseRecommendations(userId, requestData);
          
          if (streamResult.success) {
            const exercises = [];
            
            // Collect exercises from the stream
            for await (const exercise of streamResult.elementStream) {
              exercises.push(exercise);
              // Call the streaming callback for each exercise
              if (options.onExercise) {
                options.onExercise(exercise);
              }
            }
            
            console.log(`Successfully streamed ${exercises.length} exercises for user ${userId}`);
            
            // Clean up preferences marked for deletion after call
            try {
              const cleanupResult = await cleanupPreferences(userId);
              console.log(`Tool cleanup after streaming: deleted ${cleanupResult.deletedCount || 0} preferences`);
            } catch (cleanupError) {
              console.error('Error cleaning up preferences in tool:', cleanupError);
              // Don't fail the request for cleanup errors
            }
            
            return { 
              recommendations: exercises,
              streaming: true,
              count: exercises.length
            };
          } else {
            throw new Error(streamResult.error || 'Streaming failed');
          }
        } catch (error) {
          console.error('Error in streaming recommendations:', error);
          // Fall back to regular recommendations
          const recommendations = await generateExerciseRecommendations(userId, requestData);
          return { 
            recommendations: recommendations.data?.recommendations || [],
            streaming: false,
            fallback: true
          };
        }
      } else {
        // Use regular (non-streaming) recommendations
        const recommendations = await generateExerciseRecommendations(userId, requestData);
        console.log('Regular recommendations:', recommendations);
        
        // Clean up preferences marked for deletion after call
        // Note: generateExerciseRecommendations already does cleanup, but adding here for consistency
        try {
          const cleanupResult = await cleanupPreferences(userId);
          console.log(`Tool cleanup after non-streaming: deleted ${cleanupResult.deletedCount || 0} preferences`);
        } catch (cleanupError) {
          console.error('Error cleaning up preferences in tool:', cleanupError);
          // Don't fail the request for cleanup errors
        }
        
        return { 
          recommendations: recommendations.data?.recommendations || [],
          streaming: false
        };
      }
    },
  });
}

module.exports = { createRecommendExerciseTool };
