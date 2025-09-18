const { openai } = require('@ai-sdk/openai');
const { generateObject, streamObject } = require('ai');
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


// Base schema for common exercise properties
const BaseExerciseSchema = z.object({
      exercise_name: z.string(),
      aliases: z.array(z.string()).optional(),
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
  equipment: z.array(z.string()).optional(),
      movement_pattern: z.array(
        z.enum([
          "squat",
          "hinge", 
          "push",
          "pull",
          "carry",
          "rotation_core",
          "isolation",
          "conditioning",
          "plyometric",
          "balance",
          "flexibility",
          "yoga"
        ])
      ).optional(),
      exercise_description: z.string().optional(),
      body_region: z.string().optional()
});

// Individual exercise schema for streaming (array output strategy)
const IndividualExerciseSchema = z.discriminatedUnion("exercise_type", [
      // Strength/Resistance Training - Sets, reps, and weight
      BaseExerciseSchema.extend({
        exercise_type: z.literal("strength"),
        sets: z.number().int().positive(),
        reps: z.array(z.number().int().positive()),
        load_kg_each: z.array(z.number().nonnegative()),
        rest_seconds: z.number().int().positive().optional()
      }),
      
      // Cardio - Distance based (running, cycling, etc.)
      BaseExerciseSchema.extend({
        exercise_type: z.literal("cardio_distance"),
        distance_km: z.number().positive(),
        duration_min: z.number().int().positive().optional(),
        target_pace: z.string().optional(), // e.g., "5:30/km"
      }),
      
      // Cardio - Time based (steady state)
      BaseExerciseSchema.extend({
        exercise_type: z.literal("cardio_time"),
        duration_min: z.number().int().positive(),
        target_intensity: z.enum(["low", "moderate", "high"]).optional(),
        target_heart_rate_bpm: z.number().int().positive().optional()
      }),
      
      // HIIT/Interval Training
      BaseExerciseSchema.extend({
        exercise_type: z.literal("hiit"),
        rounds: z.number().int().positive(),
        intervals: z.array(
          z.object({
            work_sec: z.number().int().positive(),
            rest_sec: z.number().int().positive()
          })
        ),
        total_duration_min: z.number().int().positive().optional()
      }),
      
      // Circuit Training (multiple exercises in sequence)
      BaseExerciseSchema.extend({
        exercise_type: z.literal("circuit"),
        circuits: z.number().int().positive(),
        exercises_in_circuit: z.array(
          z.object({
            name: z.string(),
            duration_sec: z.number().int().positive().optional(),
            reps: z.number().int().positive().optional()
          })
        ),
        rest_between_circuits_sec: z.number().int().positive()
      }),
      
      // Flexibility/Stretching - Hold-based
      BaseExerciseSchema.extend({
        exercise_type: z.literal("flexibility"),
        holds: z.array(
          z.object({
            position: z.string(),
            duration_sec: z.number().int().positive()
          })
        ),
        repetitions: z.number().int().positive().optional()
      }),
      
      // Yoga/Flow - Sequence based
      BaseExerciseSchema.extend({
        exercise_type: z.literal("yoga"),
        sequence: z.array(
          z.object({
            pose: z.string(),
            duration_sec: z.number().int().positive().optional(),
            breaths: z.number().int().positive().optional()
          })
        ),
        total_duration_min: z.number().int().positive()
      }),
      
      // Bodyweight - Rep based without external load
      BaseExerciseSchema.extend({
        exercise_type: z.literal("bodyweight"),
        sets: z.number().int().positive(),
        reps: z.array(z.number().int().positive()),
        rest_seconds: z.number().int().positive().optional(),
        progression_level: z.enum(["beginner", "intermediate", "advanced"]).optional()
      }),
      
      // Isometric - Hold-based exercises like planks, wall sits
      BaseExerciseSchema.extend({
        exercise_type: z.literal("isometric"),
        sets: z.number().int().positive(),
        hold_duration_sec: z.array(z.number().int().positive()),
        rest_seconds: z.number().int().positive().optional(),
        progression_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        progression_notes: z.string().optional() // e.g., "increase hold time by 5 seconds"
      }),
      
      // Plyometric - Explosive movements
      BaseExerciseSchema.extend({
        exercise_type: z.literal("plyometric"),
        sets: z.number().int().positive(),
        reps: z.array(z.number().int().positive()),
        rest_seconds: z.number().int().positive(),
        jump_height_cm: z.number().positive().optional(),
        landing_emphasis: z.string().optional()
      }),
      
      // Balance/Stability - Time-based holds
      BaseExerciseSchema.extend({
        exercise_type: z.literal("balance"),
        sets: z.number().int().positive(),
        hold_duration_sec: z.array(z.number().int().positive()),
        difficulty_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        support_used: z.string().optional() // e.g., "wall", "none", "bosu ball"
      }),
      
      // Sports-Specific - Skill practice
      BaseExerciseSchema.extend({
        exercise_type: z.literal("sport_specific"),
        sport: z.string(),
        drill_name: z.string(),
        duration_min: z.number().int().positive(),
        repetitions: z.number().int().positive().optional(),
        skill_focus: z.string() // e.g., "accuracy", "speed", "technique"
      })
    ]);

// Discriminated union schema for different exercise types (non-streaming)
const TypedExerciseRecommendationSchema = z.object({
  recommendations: z.array(IndividualExerciseSchema)
});


// System prompt for the AI personal trainer
const SYSTEM_PROMPT = `You are an AI personal trainer. Your job is to generate the next set of exercises for the user. 
You must return recommendations that are:
- Personalized to the user's stats, goals, and history
- Effective for progression over time
- Optimal for the user's current preferences, equipment, and constraints
- Properly typed according to the exercise_type field

EXERCISE TYPES AND THEIR REQUIRED FORMATS:
1. "strength" - Weighted exercises: requires sets, reps[], load_kg_each[], optional rest_seconds
2. "cardio_distance" - Distance-based cardio: requires distance_km, optional duration_min, target_pace, elevation_gain_m
3. "cardio_time" - Time-based cardio: requires duration_min, optional target_intensity, target_heart_rate_bpm
4. "hiit" - High-intensity intervals: requires rounds, intervals[{work_sec, rest_sec}], optional total_duration_min
5. "circuit" - Circuit training: requires circuits, exercises_in_circuit[{name, duration_sec?, reps?}], rest_between_circuits_sec
6. "flexibility" - Stretching: requires holds[{position, duration_sec}], optional repetitions
7. "yoga" - Yoga flows: requires sequence[{pose, duration_sec?, breaths?}], total_duration_min
8. "bodyweight" - Bodyweight exercises with reps: requires sets, reps[], optional rest_seconds, progression_level
9. "isometric" - Hold-based exercises (planks, wall sits): requires sets, hold_duration_sec[], optional rest_seconds, progression_level
10. "plyometric" - Explosive movements: requires sets, reps[], rest_seconds, optional jump_height_cm, landing_emphasis
11. "balance" - Balance training: requires sets, hold_duration_sec[], optional difficulty_level, support_used
12. "sport_specific" - Sport drills: requires sport, drill_name, duration_min, optional repetitions, skill_focus

IMPORTANT: 
- Choose the correct exercise_type first, then provide ONLY the fields required for that type
- If the user explicitly requests something, this preference OVERRIDES all other long-term goals and history
- ALWAYS generate the EXACT number of exercises requested - no more, no less
- If you cannot generate enough exercises, create variations or progressions of existing exercises
- Always return your answer in strict JSON format. Do not include extra commentary outside the JSON.`;

// Process rules for the model
const PROCESS_RULES = `Follow this process each time:
1. Check for explicit user preferences in the current data. If present, ignore long-term category/muscle goals and satisfy the preference fully.
2. If no overriding preference is present, analyze the user's goals, history, equipment, and constraints.
3. Follow the bias signals which category or muscle groups are most under-target or most relevant when recommending exercises.
   3a. When labeling the goals_addressed and muscles_utilized, only select from the provided user's exercise categories and muscles. Do NOT make up your own categories or muscles.
4. DETERMINE THE CORRECT EXERCISE TYPE for each exercise:
   - Barbell/dumbbell/machine exercises with weight → "strength"
   - Running/cycling with distance → "cardio_distance" 
   - Treadmill/bike with time focus → "cardio_time"
   - High-intensity intervals → "hiit"
   - Multiple exercises in sequence → "circuit"
   - Static stretches/holds → "flexibility"
   - Yoga poses/flows → "yoga"
   - Push-ups/squats/burpees without weight → "bodyweight"
   - Planks/wall sits/static holds → "isometric"
   - Jump training → "plyometric"
   - Balance challenges → "balance"
   - Sport-specific drills → "sport_specific"
5. Select exercises that match available equipment and respect pain/avoid preferences. Consider most recently completed exercises when recommending new exercises.
6. Apply progression logic using the user's workout history (increase load/reps slightly if appropriate).
7. Choose the most relevant exercises for the user's available time and preferences.
8. For each exercise, explain the reasoning in 1 sentence.
9. IMPORTANT: For muscles_utilized, list ALL muscles involved in the exercise and ensure the shares add up to exactly 1.0. For example:
   - Single muscle exercise: [{"muscle": "Biceps", "share": 1.0}]
   - Multi-muscle exercise: [{"muscle": "Chest", "share": 0.6}, {"muscle": "Triceps", "share": 0.3}, {"muscle": "Shoulders", "share": 0.1}]
10. Return results as a JSON array of exercise objects with the correct exercise_type and corresponding fields.
11. CRITICAL: Generate EXACTLY the number of exercises requested. Count your exercises before responding. If you need more exercises, create variations by:
    - Adjusting sets/reps/weight for different difficulty levels
    - Using different equipment for the same movement (e.g., barbell vs dumbbell)
    - Creating unilateral versions (single arm/leg) of bilateral exercises
    - Adding isometric holds or tempo variations`;

/**
 * Generates exercise recommendations using OpenAI (streaming version)
 * @param {string} userId - The user's UUID
 * @param {Object} requestData - Additional request data (exerciseCount, explicit preferences, etc.)
 * @returns {Object} Streaming exercise recommendations
 */
async function streamExerciseRecommendations(userId, requestData = {}) {
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
      ? `CRITICAL: Generate exactly ${exerciseCount} exercise recommendations. Count them carefully before responding. Do not generate fewer than ${exerciseCount} exercises under any circumstances.`
      : `Generate an appropriate number of exercises based on the user's goals and available time (typically 3-8 exercises).`;

    // Create the user prompt with all relevant data
    const userPrompt = `
User Context:
${JSON.stringify(userContext, null, 2)}

${PROCESS_RULES}

${exerciseCountInstruction}

Please generate exercise recommendations based on this user data and follow the process rules strictly.
Return each exercise as a separate object in an array.
    `;

    console.log('Streaming exercise recommendations for user:', userId);
    console.log('User prompt length:', userPrompt.length);

    // Generate structured output using Vercel AI SDK with streaming
    const result = streamObject({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: IndividualExerciseSchema,
      output: 'array',
      temperature: 0.7,
      onError({ error }) {
        console.error('Streaming error:', error);
      }
    });

    return {
      success: true,
      elementStream: result.elementStream,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        requestData,
        userDataFetched: userData.success,
        streaming: true
      }
    };

  } catch (error) {
    console.error('Error streaming exercise recommendations:', error);
    
    return {
      success: false,
      error: error.message,
      userId,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

/**
 * Generates exercise recommendations using OpenAI (non-streaming version)
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
      ? `CRITICAL: Generate exactly ${exerciseCount} exercise recommendations. Count them carefully before responding. Do not generate fewer than ${exerciseCount} exercises under any circumstances.`
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
      schema: TypedExerciseRecommendationSchema,
      temperature: 0.7,
    });

    console.log('Successfully generated exercise recommendations');
    
    // Validate exercise count if specified
    const actualCount = result.object.recommendations.length;
    if (exerciseCount && actualCount !== exerciseCount) {
      console.warn(`Warning: Requested ${exerciseCount} exercises but got ${actualCount}`);
    }
    
    return {
      success: true,
      data: result.object,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        requestData,
        userDataFetched: userData.success,
        recommendationCount: actualCount,
        requestedCount: exerciseCount,
        countMismatch: exerciseCount ? actualCount !== exerciseCount : false
      }
    };

  } catch (error) {
    console.error('Error generating exercise recommendations:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message;
    let errorDetails = null;
    
    if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'NoObjectGeneratedError') {
      errorMessage = 'AI failed to generate valid exercise recommendations. This may be due to schema validation issues.';
      errorDetails = {
        type: 'schema_validation_error',
        originalError: error.message,
        suggestion: 'Try reducing the number of exercises requested or check for invalid movement patterns.'
      };
    } else if (error.name === 'AI_TypeValidationError') {
      errorMessage = 'Generated exercises did not match the expected format.';
      errorDetails = {
        type: 'type_validation_error',
        originalError: error.message,
        suggestion: 'The AI generated invalid data. Please try again.'
      };
    }
    
    return {
      success: false,
      error: errorMessage,
      errorDetails,
      userId,
      timestamp: new Date().toISOString(),
      data: null
    };
  }
}

module.exports = {
  generateExerciseRecommendations,
  streamExerciseRecommendations,
  ExerciseRecommendationSchema,
  TypedExerciseRecommendationSchema,
  IndividualExerciseSchema,
  BaseExerciseSchema
};
