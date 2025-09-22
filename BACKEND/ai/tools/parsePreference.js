const { tool } = require('ai');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');
const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPBASE_SECRET_KEY);

/**
 * Parse a user preference using AI and store it in the database
 * @param {string} userId - The user ID for context
 * @returns {Object} Tool definition for AI SDK
 */
function createParsePreferenceTool(userId) {
  return tool({
    description: 'Parse and store user preferences for exercise recommendations. Use this when the user expresses preferences, limitations, or requirements that should influence their exercise recommendations. ALWAYS pass the user\'s exact words as the userInput parameter.',
    parameters: z.object({
      userInput: z.string().min(1).describe('The user\'s exact input expressing a preference, limitation, or requirement - pass their full message here')
    }),
    execute: async ({ userInput }) => {
      console.log(`Parsing preference for user ${userId}: "${userInput}"`);
      
      // Validate userInput
      if (!userInput || typeof userInput !== 'string' || userInput.trim() === '') {
        console.error('Invalid userInput:', userInput);
        return {
          success: false,
          error: 'Invalid user input provided',
          message: 'I need a valid preference or requirement to parse. Please tell me what you\'d like me to note.'
        };
      }
      
      try {
        // Use AI to parse and structure the preference
        const { object: parsedPreference } = await generateObject({
          model: openai('gpt-4o'),
          schema: z.object({
            type: z.enum([
              'workout',         // Preferences about workout type, style, or modality (e.g., "I want HIIT", "I prefer yoga")
              'injury',          // Preferences or limitations due to injury or pain (e.g., "My knee hurts", "I have a bad back")
              'time',            // Preferences about timing, duration, or schedule (e.g., "I only have 20 minutes", "Morning workouts only")
              'equipment',       // Preferences about equipment availability or restrictions (e.g., "No equipment", "I have dumbbells")
              'intensity',       // Preferences about workout intensity (e.g., "Take it easy today", "I want a hard workout")
              'muscle_group',    // Preferences about muscle groups to target or avoid (e.g., "Focus on legs", "Avoid shoulders")
              'exercise',        // Preferences about specific exercises (e.g., "No burpees", "I like squats")
              'goal',            // Preferences about fitness goals (e.g., "Build muscle", "Lose weight")
              'recovery',        // Preferences about recovery or rehabilitation (e.g., "Shoulder recovery", "Active recovery only")
              'other'            // Any other type of preference not covered above
            ]),
            description: z.string(),
            recommendationsGuidance: z.string(),
            expireTime: z.string().nullable(),
            deleteAfterCall: z.boolean(),
            reasoning: z.string()
          }),
          prompt: `Parse this user input and return the actual preference data (NOT a schema):

User input: "${userInput}"

You must return actual data values, not a JSON schema. 

IMPORTANT: Detect if the user is requesting exercises RIGHT NOW vs expressing a general preference:

**IMMEDIATE EXERCISE REQUESTS** (phrases like "I want to do exercise", "give me exercises", "I need a workout", "show me exercises") should be DELETED AFTER CALL:
- expireTime: null (no expiration needed since it will be deleted immediately after use)
- deleteAfterCall: true

**GENERAL PREFERENCES** (phrases like "I don't like", "I hate", "I prefer", "I always") should be PERMANENT:
- expireTime: null  
- deleteAfterCall: false

**RULE: If deleteAfterCall is true, then expireTime MUST be null (since the preference will be deleted immediately after the recommendation call)**

Examples:

For "I want to do exercise for my hamstrings" (IMMEDIATE REQUEST), return:
{
  "type": "muscle_group",
  "description": "User wants exercises targeting the hamstrings right now",
  "recommendationsGuidance": "Include exercises that focus on the hamstring muscles",
  "expireTime": null,
  "deleteAfterCall": true,
  "reasoning": "Immediate exercise request will be deleted after providing recommendations"
}

For "I don't like burpees" (GENERAL PREFERENCE), return:
{
  "type": "exercise",
  "description": "User dislikes burpee exercises",
  "recommendationsGuidance": "Avoid burpees in exercise recommendations",
  "expireTime": null,
  "deleteAfterCall": false,
  "reasoning": "General dislike indicates permanent preference"
}

Classify the type as one of: workout, injury, time, equipment, intensity, muscle_group, exercise, goal, recovery, other

Current time: ${new Date().toISOString()}`
        });

        console.log('Parsed preference:', parsedPreference);

        // Store the preference in the database
        const { data, error } = await supabase
          .from('preferences')
          .insert({
            user_id: userId,
            type: parsedPreference.type,
            description: parsedPreference.description,
            user_transcription: userInput,
            recommendations_guidance: parsedPreference.recommendationsGuidance,
            expire_time: parsedPreference.expireTime,
            delete_after_call: parsedPreference.deleteAfterCall
          })
          .select()
          .single();

        if (error) {
          console.error('Error storing preference:', error);
          throw new Error(`Failed to store preference: ${error.message}`);
        }

        console.log('Successfully stored preference:', data);

        return {
          success: true,
          preference: {
            id: data.id,
            type: parsedPreference.type,
            description: parsedPreference.description,
            expireTime: parsedPreference.expireTime,
            deleteAfterCall: parsedPreference.deleteAfterCall,
            reasoning: parsedPreference.reasoning
          },
          message: `I've noted your preference: "${parsedPreference.description}". This will ${parsedPreference.type === 'permanent' ? 'always' : 'temporarily'} be considered when recommending exercises${parsedPreference.expireTime ? ` until ${new Date(parsedPreference.expireTime).toLocaleString()}` : ''}.`
        };

      } catch (error) {
        console.error('Error parsing preference:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          userInput: userInput,
          userId: userId
        });
        
        return {
          success: false,
          error: error.message,
          message: 'I had trouble understanding your preference. Could you please rephrase it?'
        };
      }
    },
  });
}

/**
 * Fetch active preferences for a user
 * @param {string} userId - The user ID
 * @returns {Array} Array of active preferences
 */
async function getActivePreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('preferences')
      .select('*')
      .eq('user_id', userId)
      .or('expire_time.is.null,expire_time.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching preferences:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getActivePreferences:', error);
    return [];
  }
}

/**
 * Clean up expired and post-call preferences
 * @param {string} userId - The user ID
 * @returns {Object} Cleanup result
 */
async function cleanupPreferences(userId) {
  try {
    const now = new Date().toISOString();
    
    // Delete expired preferences and those marked for deletion after call
    const { data, error } = await supabase
      .from('preferences')
      .delete()
      .eq('user_id', userId)
      .or(`expire_time.lt.${now},delete_after_call.eq.true`)
      .select();

    if (error) {
      console.error('Error cleaning up preferences:', error);
      return { success: false, error: error.message };
    }

    console.log(`Cleaned up ${data?.length || 0} preferences for user ${userId}`);
    return { success: true, deletedCount: data?.length || 0 };
  } catch (error) {
    console.error('Error in cleanupPreferences:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { 
  createParsePreferenceTool,
  getActivePreferences,
  cleanupPreferences
};
