const { openai } = require('@ai-sdk/openai');
const { generateObject, streamObject } = require('ai');
const { z } = require('zod');
const { fetchAllUserData } = require('./fetchUserData.service');
const { cleanupPreferences } = require('../ai/tools/parsePreference');

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
      }),
      
      // Isometric - Hold-based exercises like planks, wall sits
      BaseExerciseSchema.extend({
        exercise_type: z.literal("isometric"),
        sets: z.number().int().positive(),
        hold_duration_sec: z.array(z.number().int().positive()),
        rest_seconds: z.number().int().positive().optional(),
      }),
      
      // Balance/Stability - Time-based holds
      BaseExerciseSchema.extend({
        exercise_type: z.literal("balance"),
        sets: z.number().int().positive(),
        hold_duration_sec: z.array(z.number().int().positive()),
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

/**
 * Helper function to calculate relative time from a date
 * Handles future dates (for expiration) and past dates (for history)
 * @param {string} dateString - ISO date string
 * @returns {string} Human-readable relative time
 */
function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date - now; // Future dates are positive, past are negative
  const absDiffMs = Math.abs(diffMs);
  
  const diffMinutes = Math.floor(absDiffMs / (1000 * 60));
  const diffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  // For past dates (history)
  if (diffMs < 0) {
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks === 1) return '1 week ago';
    if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
    if (diffMonths === 1) return '1 month ago';
    return `${diffMonths} months ago`;
  }
  
  // For future dates (expiration)
  if (diffMinutes < 1) return 'in less than a minute';
  if (diffMinutes === 1) return 'in 1 minute';
  if (diffMinutes < 60) return `in ${diffMinutes} minutes`;
  if (diffHours === 1) return 'in 1 hour';
  if (diffHours < 24) return `in ${diffHours} hours`;
  if (diffDays === 0) return 'later today';
  if (diffDays === 1) return 'in 1 day';
  if (diffDays < 7) return `in ${diffDays} days`;
  if (diffWeeks === 1) return 'in 1 week';
  if (diffWeeks < 4) return `in ${diffWeeks} weeks`;
  if (diffMonths === 1) return 'in 1 month';
  return `in ${diffMonths} months`;
}

/**
 * Formats user data into natural language for AI prompt
 * @param {Object} userData - Structured user data from fetchAllUserData
 * @returns {string} Natural language formatted user context
 */
function formatUserDataAsNaturalLanguage(userData) {
  let output = [];
  
  // Body Stats
  if (userData.bodyStats) {
    const bs = userData.bodyStats;
    const age = bs.dob ? Math.floor((new Date() - new Date(bs.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    const ageStr = age ? `${age}-year-old ` : '';
    const sexStr = bs.sex || 'person';
    const heightStr = bs.height_cm ? `${bs.height_cm}cm` : '';
    const weightStr = bs.weight_kg ? `${bs.weight_kg}kg` : '';
    const bodyFatStr = bs.body_fat_pct ? `, ${bs.body_fat_pct}% body fat` : '';
    
    output.push(`BODY STATS: ${ageStr}${sexStr}, ${heightStr}, ${weightStr}${bodyFatStr}`);
  }
  
  // Goals (Category Weights) - filter and prioritize
  if (userData.userCategoryAndWeights && userData.userCategoryAndWeights.length > 0) {
    const activeGoals = userData.userCategoryAndWeights.filter(c => c.weight > 0);
    if (activeGoals.length > 0) {
      const highPriority = activeGoals.filter(g => g.weight >= 0.7);
      const mediumPriority = activeGoals.filter(g => g.weight >= 0.3 && g.weight < 0.7);
      const lowPriority = activeGoals.filter(g => g.weight > 0 && g.weight < 0.3);
      
      if (highPriority.length > 0) {
        output.push(`PRIMARY GOALS: ${highPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
      if (mediumPriority.length > 0) {
        output.push(`SECONDARY GOALS: ${mediumPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
      if (lowPriority.length > 0) {
        output.push(`TERTIARY GOALS: ${lowPriority.map(g => `${g.category} (${g.weight})`).join(', ')}`);
      }
    }
  }
  
  // Muscles (Muscle Weights) - filter and prioritize
  if (userData.userMuscleAndWeight && userData.userMuscleAndWeight.length > 0) {
    const activeMuscles = userData.userMuscleAndWeight.filter(m => m.weight > 0);
    if (activeMuscles.length > 0) {
      const highPriority = activeMuscles.filter(m => m.weight >= 0.7);
      const mediumPriority = activeMuscles.filter(m => m.weight >= 0.3 && m.weight < 0.7);
      const lowPriority = activeMuscles.filter(m => m.weight > 0 && m.weight < 0.3);
      
      if (highPriority.length > 0) {
        output.push(`HIGH PRIORITY MUSCLES: ${highPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
      if (mediumPriority.length > 0) {
        output.push(`MEDIUM PRIORITY MUSCLES: ${mediumPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
      if (lowPriority.length > 0) {
        output.push(`LOW PRIORITY MUSCLES: ${lowPriority.map(m => `${m.muscle} (${m.weight})`).join(', ')}`);
      }
    }
  }
  
  // Location and Equipment
  if (userData.locations) {
    const loc = userData.locations;
    const nameStr = loc.name ? `${loc.name}` : 'Current location';
    const equipmentStr = loc.equipment && loc.equipment.length > 0 ? loc.equipment.join(', ') : 'no specific equipment listed';
    output.push(`LOCATION: ${nameStr} with equipment: ${equipmentStr}`);
  }
  
  // Preferences (separate temporary and permanent)
  // Temporary = has expire_time or delete_after_call=true (session-specific, override everything)
  // Permanent = no expire_time and delete_after_call=false/null (long-term restrictions)
  if (userData.preferences) {
    if (userData.preferences.temporary && userData.preferences.temporary.length > 0) {
      output.push(`TEMPORARY PREFERENCES (override all other goals - will expire or be deleted):`);
      userData.preferences.temporary.forEach(pref => {
        const guidance = pref.recommendations_guidance || pref.description;
        const expireInfo = pref.expire_time 
          ? ` [expires: ${getRelativeTime(pref.expire_time)}]` 
          : pref.delete_after_call ? ' [one-time use]' : '';
        output.push(`  - ${guidance}${expireInfo}`);
      });
      output.push(''); // Blank line separator
    }
    
    if (userData.preferences.permanent && userData.preferences.permanent.length > 0) {
      output.push(`PERMANENT PREFERENCES (always apply):`);
      userData.preferences.permanent.forEach(pref => {
        output.push(`  - ${pref.recommendations_guidance || pref.description}`);
      });
      output.push(''); // Blank line separator
    }
  }
  
  // Workout History (last 10-15 exercises)
  if (userData.workoutHistory && userData.workoutHistory.length > 0) {
    output.push(`RECENT WORKOUT HISTORY (for progression):`);
    userData.workoutHistory.slice(0, 15).forEach(workout => {
      const timeAgo = getRelativeTime(workout.performed_at);
      let detailsStr = '';
      
      if (workout.sets && workout.reps) {
        const repsStr = Array.isArray(workout.reps) ? workout.reps.join(',') : workout.reps;
        detailsStr = `${workout.sets} sets, ${repsStr} reps`;
        if (workout.load_kg_each) {
          const loadStr = Array.isArray(workout.load_kg_each) ? workout.load_kg_each[0] : workout.load_kg_each;
          detailsStr += `, ${loadStr}kg`;
        }
      } else if (workout.distance_km) {
        detailsStr = `${workout.distance_km}km`;
        if (workout.duration_min) {
          detailsStr += ` in ${workout.duration_min}min`;
        }
      } else if (workout.duration_min) {
        detailsStr = `${workout.duration_min}min`;
      } else if (workout.hold_duration_sec) {
        const holdStr = Array.isArray(workout.hold_duration_sec) ? workout.hold_duration_sec.join(',') : workout.hold_duration_sec;
        detailsStr = `held for ${holdStr}sec`;
      }
      
      output.push(`  - ${workout.exercise_name}: ${detailsStr} (${timeAgo})`);
    });
  }
  
  return output.join('\n');
}


// System prompt for the AI personal trainer
const SYSTEM_PROMPT = `You are an AI personal trainer generating personalized exercise recommendations.

Your recommendations must be:
- Personalized to the user's stats, goals, workout history, and current preferences
- Effective for progressive overload and continuous improvement
- Practical given the user's available equipment and constraints
- STRICTLY respect all user preferences, especially temporary ones which override everything else

IMPORTANT RULES:
- The output format is enforced by a strict schema - focus on selecting the best exercises, not formatting
- Choose appropriate exercise_type for each exercise (strength, cardio_distance, cardio_time, hiit, circuit, flexibility, yoga, bodyweight, isometric, balance, sport_specific)
- When labeling goals_addressed and muscles_utilized, use ONLY the categories and muscles provided in the user's profile
- For muscles_utilized, ensure shares add up to 1.0 (e.g., Chest: 0.6, Triceps: 0.3, Shoulders: 0.1)
- Apply progressive overload by slightly increasing load/reps/difficulty from recent workout history when appropriate
- Generate EXACTLY the number of exercises requested - no more, no less`;

// Process rules for the model
// Note: Temporary preferences are those with expire_time or delete_after_call=true
// Permanent preferences have no expire_time and delete_after_call=false/null
const PROCESS_RULES = `DECISION HIERARCHY (most important first):
1. TEMPORARY PREFERENCES - Override everything else (session-specific needs with expiration or one-time use)
2. EXPLICIT REQUESTS - Any specific request in the current interaction
3. PERMANENT PREFERENCES - Long-term restrictions and preferences (no expiration)
4. GOALS & MUSCLES - Priority based on weights (higher weight = higher priority)
5. WORKOUT HISTORY - Use for progression and variety

EXERCISE SELECTION PROCESS:
1. Identify which goals and muscles to prioritize based on their weights
2. Review recent workout history to apply progressive overload (increase load/reps by 5-10% when appropriate)
3. Avoid recently completed exercises unless specifically requested
4. Select exercises matching available equipment
5. Choose appropriate exercise_type for each exercise
6. Provide brief reasoning (1 sentence) explaining why each exercise was selected
7. Ensure variety in movement patterns and muscle groups unless preferences specify otherwise`;

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
    
    // Format user data as natural language
    const formattedUserData = formatUserDataAsNaturalLanguage(userData.data);

    // Create exercise count instruction
    const exerciseCountInstruction = exerciseCount 
      ? `Generate exactly ${exerciseCount} exercises.`
      : `Generate 3-8 exercises based on the user's goals and available time.`;

    // Create the user prompt with natural language formatted data
    const userPrompt = `
USER PROFILE:
${formattedUserData}

${requestData.explicitPreferences ? `\nEXPLICIT REQUEST: ${requestData.explicitPreferences}\n` : ''}

${PROCESS_RULES}

${exerciseCountInstruction}
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

    // Clean up preferences marked for deletion after call
    // Note: This happens after streaming starts, cleanup will occur while client receives data
    try {
      const cleanupResult = await cleanupPreferences(userId);
      console.log(`Cleanup after streaming: deleted ${cleanupResult.deletedCount || 0} preferences`);
    } catch (cleanupError) {
      console.error('Error cleaning up preferences after streaming:', cleanupError);
      // Don't fail the request for cleanup errors
    }

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
    
    // Format user data as natural language
    const formattedUserData = formatUserDataAsNaturalLanguage(userData.data);

    // Create exercise count instruction
    const exerciseCountInstruction = exerciseCount 
      ? `Generate exactly ${exerciseCount} exercises.`
      : `Generate 3-8 exercises based on the user's goals and available time.`;

    // Create the user prompt with natural language formatted data
    const userPrompt = `
USER PROFILE:
${formattedUserData}

${requestData.explicitPreferences ? `\nEXPLICIT REQUEST: ${requestData.explicitPreferences}\n` : ''}

${PROCESS_RULES}

${exerciseCountInstruction}
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
    
    // Clean up preferences marked for deletion after call
    try {
      await cleanupPreferences(userId);
    } catch (cleanupError) {
      console.error('Error cleaning up preferences:', cleanupError);
      // Don't fail the whole request for cleanup errors
    }
    
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
