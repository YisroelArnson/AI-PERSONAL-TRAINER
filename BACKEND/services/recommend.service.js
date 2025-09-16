const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');
const { z } = require('zod');
const { fetchAllUserData } = require('./fetchUserData.service');

// Zod schema for exercise recommendations output format
const ExerciseRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      exercise_name: z.string(),
      sets: z.number().int().positive(),
      reps: z.array(z.number().int().positive()),
      load_kg_each: z.array(z.number().nonnegative()),
      muscles_utilized: z.array(
        z.object({
          muscle: z.string(),
          share: z.number().min(0).max(1)
        })
      ).refine(
        (muscles) => {
          if (muscles.length === 0) return true; // Allow empty array
          const totalShare = muscles.reduce((sum, m) => sum + m.share, 0);
          return Math.abs(totalShare - 1.0) < 0.01; // Allow for small floating point errors
        },
        { message: "Muscle shares must add up to 1.0" }
      ),
      goals_addressed: z.array(z.string()),
      reasoning: z.string()
    })
  )
});

// Alternate Zod schema for exercise recommendations (for testing)
const AlternateExerciseRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      exercise_name: z.string(),
      aliases: z.array(z.string()).optional(),
      duration_min: z.number().int().nonnegative().optional(),
      reps: z.array(z.number().int().positive()).optional(),
      load_kg_each: z.array(z.number().nonnegative()).optional(),
      distance_km: z.number().nonnegative().optional(),
      intervals: z.array(
        z.object({
          work_sec: z.number().int().positive().optional(),
          rest_sec: z.number().int().positive().optional()
        })
      ).optional(),
      rounds: z.number().int().nonnegative().optional(),
      muscles_utilized: z.array(
        z.object({
          muscle: z.string(),
          share: z.number().min(0).max(1)
        })
      ).refine(
        (muscles) => {
          if (muscles.length === 0) return true;
          const totalShare = muscles.reduce((sum, m) => sum + m.share, 0);
          return Math.abs(totalShare - 1.0) < 0.01;
        },
        { message: "Muscle shares must add up to 1.0" }
      ),
      goals_addressed: z.array(z.string()),
      reasoning: z.string(),
      equiptment: z.array(z.string()).optional(),
      movement_pattern: z.array(
        z.enum([
          "squat",
          "hinge",
          "push",
          "pull",
          "carry",
          "rotation_core",
          "isolation",
          "conditioning"
        ])
      ).optional(),
      exercise_description: z.string().optional(),
      body_region: z.string().optional()
    })
  )
});


// System prompt for the AI personal trainer
const SYSTEM_PROMPT = `You are an AI personal trainer. Your job is to generate the next set of exercises for the user. 
You must return recommendations that are:
- Personalized to the user's stats, goals, and history
- Effective for progression over time
- Optimal for the user's current preferences, equipment, and constraints
IMPORTANT: If the user explicitly requests something, this preference OVERRIDES all other long-term goals and history. Always listen to explicit user preferences first.
Always return your answer in strict JSON format. Do not include extra commentary outside the JSON.`;

// Process rules for the model
const PROCESS_RULES = `Follow this process each time:
1. Check for explicit user preferences in the current data. If present, ignore long-term category/muscle goals and satisfy the preference fully.
2. If no overriding preference is present, analyze the user's goals, history, equipment, and constraints.
3. Follow the bias signals which category or muscle groups are most under-target or most relevant when recommending exercises.
   3a. When labeling the goals_addressed and muscles_utilized, only select from the provided user's exercise categories and muscles. Do NOT make up your own categories or muscles.
4. Select exercises that match available equipment and respect pain/avoid preferences. And consider most recently completed exercises when recommending new exercises.
5. Apply progression logic using the user's workout history (increase load/reps slightly if appropriate).
6. Choose the most relevant exercises for the user's available time and preferences.
7. For each exercise, explain the reasoning in 1 sentence.
8. IMPORTANT: For muscles_utilized, list ALL muscles involved in the exercise and ensure the shares add up to exactly 1.0. For example:
   - Single muscle exercise: [{"muscle": "Biceps", "share": 1.0}]
   - Multi-muscle exercise: [{"muscle": "Chest", "share": 0.6}, {"muscle": "Triceps", "share": 0.3}, {"muscle": "Shoulders", "share": 0.1}]
9. Return results as a JSON array of exercise objects (see format).`;

/**
 * Generates exercise recommendations using OpenAI
 * @param {string} userId - The user's UUID
 * @param {Object} requestData - Additional request data (exerciseCount, explicit preferences, etc.)
 * @returns {Object} Exercise recommendations
 */
async function generateExerciseRecommendations(userId, requestData = {}) {
  try {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    // Fetch all user data
    const userData = await fetchAllUserData(userId);
    
    if (!userData.success) {
      throw new Error(`Failed to fetch user data: ${userData.error || 'Unknown error'}`);
    }

    // Extract exercise count from request data
    const exerciseCount = requestData.exerciseCount;
    
    // Prepare the user data for the AI prompt
    const userContext = {
      userData: userData.data,
      requestData: requestData,
      timestamp: new Date().toISOString()
    };

    // Create exercise count instruction
    const exerciseCountInstruction = exerciseCount 
      ? `Generate exactly ${exerciseCount} exercise recommendations.`
      : `Generate an appropriate number of exercises based on the user's goals and available time (typically 3-8 exercises).`;

    // Create the user prompt with all relevant data
    const userPrompt = `
User Context:
${JSON.stringify(userContext, null, 2)}

${PROCESS_RULES}

${exerciseCountInstruction}

Please generate exercise recommendations based on this user data and follow the process rules strictly.
    `;

    console.log('Generating exercise recommendations for user:', userId);
    console.log('User prompt length:', userPrompt.length);

    // Generate structured output using Vercel AI SDK
    const result = await generateObject({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: AlternateExerciseRecommendationSchema,
      temperature: 0.7,
    });

    console.log('Successfully generated exercise recommendations');
    
    return {
      success: true,
      data: result.object,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        requestData,
        userDataFetched: userData.success,
        recommendationCount: result.object.recommendations.length
      }
    };

  } catch (error) {
    console.error('Error generating exercise recommendations:', error);
    
    return {
      success: false,
      error: error.message,
      userId,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

module.exports = {
  generateExerciseRecommendations,
  ExerciseRecommendationSchema,
  AlternateExerciseRecommendationSchema
};
