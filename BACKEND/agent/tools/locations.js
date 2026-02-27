// BACKEND/agent/tools/locations.js
// Location management tools
const locationService = require('../../services/location.service');

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
          type: 'integer',
          description: 'Numeric location id to set as current (preferred)'
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
        const targetLocation = await locationService.setCurrentLocation({
          userId,
          locationId: location_id,
          locationName: location_name
        });

        // Format equipment summary
        const equipmentItems = typeof targetLocation.equipment === 'string'
          ? targetLocation.equipment
            .split(/\r?\n|,/)
            .map(s => s.replace(/^[-*•]\s*/, '').trim())
            .filter(Boolean)
          : [];
        const equipmentSummary = equipmentItems.length > 0
          ? equipmentItems.join(', ')
          : 'no equipment';

        return {
          success: true,
          location: {
            id: targetLocation.id,
            name: targetLocation.name,
            description: targetLocation.description,
            equipment_count: equipmentItems.length,
            equipment_summary: equipmentSummary
          }
        };

      } catch (error) {
        return { success: false, error: error.message, matches: error?.matches };
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
