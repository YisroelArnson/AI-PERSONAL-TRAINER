const { tool } = require('ai');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');
const { parsePreferenceText } = require('../../services/preference.service');

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
        // Use the shared parsing service
        const parsedPreference = await parsePreferenceText(userInput);
        
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
