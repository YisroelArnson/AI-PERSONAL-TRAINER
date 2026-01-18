// BACKEND/agent/tools/data.js
// Data retrieval tool for fetching additional context
const { fetchMultipleDataSources } = require('../../services/dataSources.service');

const dataTools = {
  fetch_data: {
    description: 'Fetch additional data sources into context. Use when you need information not currently available.',
    statusMessage: {
      start: 'Gathering your info...',
      done: 'Context ready'
    },
    parameters: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['user_profile', 'category_goals', 'muscle_goals', 'active_preferences', 'workout_history', 'exercise_distribution', 'user_settings', 'all_locations']
          },
          description: 'Array of data source names to fetch'
        },
        params: {
          type: 'object',
          description: 'Optional parameters for specific sources (e.g., { workout_history: { limit: 5 } })'
        }
      },
      required: ['sources']
    },
    execute: async (args, context) => {
      const { userId } = context;
      
      // Accept either { sources: [...] } or { source: "..." }
      let sources = args.sources;
      if (!sources && args.source) {
        sources = [args.source];
      }
      
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return {
          success: false,
          error: 'Invalid format: sources array or source string is required'
        };
      }
      
      const results = await fetchMultipleDataSources(
        sources, 
        userId, 
        args.params || {}
      );

      return {
        success: true,
        data: results.reduce((acc, r) => {
          acc[r.source] = r.formatted;
          return acc;
        }, {})
      };
    },
    formatResult: (result) => {
      if (!result.success) return `Data fetch failed: ${result.error}`;
      const sources = Object.keys(result.data);
      return `Fetched ${sources.length} data sources: ${sources.join(', ')}`;
    }
  }
};

module.exports = { dataTools };
