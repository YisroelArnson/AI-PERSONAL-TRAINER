// BACKEND/agent/tools/preferences.js
// Preference management tools
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const preferenceTools = {
  set_preference: {
    description: 'Create or update a user preference.',
    statusMessage: {
      start: 'Saving preference...',
      done: 'Preference saved'
    },
    parameters: {
      type: 'object',
      properties: {
        preference_type: {
          type: 'string',
          enum: ['equipment', 'location', 'time_available', 'injury', 'exclusion', 'focus', 'intensity', 'custom'],
          description: 'Type of preference'
        },
        value: {
          type: 'string',
          description: 'The preference value'
        },
        duration_type: {
          type: 'string',
          enum: ['permanent', 'session', 'temporary'],
          description: 'How long the preference should last',
          default: 'permanent'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the preference'
        }
      },
      required: ['preference_type', 'value']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      const { data, error } = await supabase
        .from('preferences')
        .insert({
          user_id: userId,
          preference_type: args.preference_type,
          value: args.value,
          duration_type: args.duration_type || 'permanent',
          metadata: args.metadata || {},
          is_active: true
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        preference: {
          id: data.id,
          type: data.preference_type,
          value: data.value,
          duration: data.duration_type
        }
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Failed to set preference: ${result.error}`;
      return `Set ${result.preference.type} preference: "${result.preference.value}" (${result.preference.duration})`;
    }
  },

  delete_preference: {
    description: 'Delete/deactivate a user preference.',
    statusMessage: {
      start: 'Removing preference...',
      done: 'Preference removed'
    },
    parameters: {
      type: 'object',
      properties: {
        preference_id: {
          type: 'string',
          description: 'ID of the preference to delete'
        }
      },
      required: ['preference_id']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      // First verify the preference belongs to the user
      const { data: existing } = await supabase
        .from('preferences')
        .select('*')
        .eq('id', args.preference_id)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        return { success: false, error: 'Preference not found' };
      }

      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('preferences')
        .update({ is_active: false })
        .eq('id', args.preference_id);

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        deleted: {
          id: existing.id,
          type: existing.preference_type,
          value: existing.value
        }
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Failed to delete: ${result.error}`;
      return `Deleted ${result.deleted.type} preference: "${result.deleted.value}"`;
    }
  }
};

module.exports = { preferenceTools };
