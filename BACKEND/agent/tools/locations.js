// BACKEND/agent/tools/locations.js
// Location management tools
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const locationTools = {
  set_current_location: {
    description: 'Switch the user\'s active location. Affects equipment availability for workouts.',
    statusMessage: {
      start: 'Switching location...',
      done: 'Location updated'
    },
    parameters: {
      type: 'object',
      properties: {
        location_id: {
          type: 'string',
          description: 'UUID of the location to set as current (preferred)'
        },
        location_name: {
          type: 'string',
          description: 'Name of the location to set as current (fallback if ID not available)'
        }
      }
      // Note: At least one of location_id or location_name required
    },
    execute: async (args, context) => {
      const { userId } = context;
      const { location_id, location_name } = args;

      if (!location_id && !location_name) {
        return {
          success: false,
          error: 'Either location_id or location_name is required'
        };
      }

      try {
        // Find the target location
        let targetLocation;

        if (location_id) {
          const { data, error } = await supabase
            .from('user_locations')
            .select('*')
            .eq('id', location_id)
            .eq('user_id', userId)
            .single();

          if (error || !data) {
            return { success: false, error: 'Location not found with that ID' };
          }
          targetLocation = data;
        } else {
          // Search by name (case-insensitive)
          const { data, error } = await supabase
            .from('user_locations')
            .select('*')
            .eq('user_id', userId)
            .ilike('name', location_name);

          if (error || !data || data.length === 0) {
            return { success: false, error: `Location "${location_name}" not found` };
          }

          if (data.length > 1) {
            return {
              success: false,
              error: `Multiple locations match "${location_name}". Please use location_id.`,
              matches: data.map(l => ({ id: l.id, name: l.name }))
            };
          }

          targetLocation = data[0];
        }

        // Check if already current
        if (targetLocation.current_location === true) {
          return {
            success: true,
            message: 'Already at this location',
            location: {
              id: targetLocation.id,
              name: targetLocation.name,
              equipment_count: targetLocation.equipment?.length || 0
            }
          };
        }

        // Transaction: Clear current_location from all, set on target
        // Step 1: Clear all current_location flags for this user
        const { error: clearError } = await supabase
          .from('user_locations')
          .update({ current_location: false })
          .eq('user_id', userId);

        if (clearError) {
          return { success: false, error: 'Failed to update locations: ' + clearError.message };
        }

        // Step 2: Set current_location on target
        const { error: setError } = await supabase
          .from('user_locations')
          .update({ current_location: true })
          .eq('id', targetLocation.id);

        if (setError) {
          return { success: false, error: 'Failed to set current location: ' + setError.message };
        }

        // Format equipment summary
        const equipmentSummary = targetLocation.equipment && targetLocation.equipment.length > 0
          ? targetLocation.equipment.map(e => typeof e === 'string' ? e : e.name).join(', ')
          : 'no equipment';

        return {
          success: true,
          location: {
            id: targetLocation.id,
            name: targetLocation.name,
            description: targetLocation.description,
            equipment_count: targetLocation.equipment?.length || 0,
            equipment_summary: equipmentSummary
          }
        };

      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    formatResult: (result) => {
      if (!result.success) {
        if (result.matches) {
          return `Multiple locations found: ${result.matches.map(m => `${m.name} (${m.id})`).join(', ')}. Please specify which one.`;
        }
        return `Failed to switch location: ${result.error}`;
      }
      if (result.message === 'Already at this location') {
        return `Already at ${result.location.name}`;
      }
      return `Switched to ${result.location.name} (${result.location.equipment_count} equipment items: ${result.location.equipment_summary})`;
    }
  }
};

module.exports = { locationTools };
