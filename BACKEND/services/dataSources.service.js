// BACKEND/services/dataSources.service.js
// Registry of all available data sources for agent context
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const formatters = require('./dataFormatters.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Registry of all available data sources
 * Each source has: fetch function, formatter, and description
 */
const DATA_SOURCES = {
  user_profile: {
    description: 'Basic user profile and body stats',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('body_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    format: formatters.formatBodyStats
  },

  workout_history: {
    description: 'Recent workout history',
    fetch: async (userId, params = {}) => {
      const limit = params.limit || 10;
      const { data } = await supabase
        .from('workout_history')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(limit);
      return data;
    },
    format: formatters.formatWorkoutHistory
  },

  user_settings: {
    description: 'User app settings and preferences',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    format: formatters.formatUserSettings
  },

  all_locations: {
    description: 'All user locations with equipment details (current marked with ★)',
    fetch: async (userId) => {
      const { data } = await supabase
        .from('user_locations')
        .select('id, name, description, equipment, geo_data, current_location, created_at')
        .eq('user_id', userId)
        .order('current_location', { ascending: false })
        .order('name', { ascending: true });
      return data;
    },
    format: formatters.formatAllLocations
  }
};

/**
 * Fetch and format a specific data source
 * @param {string} sourceName - Name of the data source
 * @param {string} userId - User's UUID
 * @param {Object} params - Optional parameters for the fetch
 * @returns {Object} Result with source name, raw data, and formatted string
 */
async function fetchDataSource(sourceName, userId, params = {}) {
  const source = DATA_SOURCES[sourceName];
  if (!source) {
    throw new Error(`Unknown data source: ${sourceName}`);
  }

  const rawData = await source.fetch(userId, params);
  const formatted = source.format(rawData);
  
  return {
    source: sourceName,
    raw: rawData,
    formatted
  };
}

/**
 * Fetch multiple data sources in parallel
 * @param {Array} sourceNames - Array of data source names
 * @param {string} userId - User's UUID
 * @param {Object} params - Optional parameters keyed by source name
 * @returns {Array} Array of results
 */
async function fetchMultipleDataSources(sourceNames, userId, params = {}) {
  const results = await Promise.all(
    sourceNames.map(name => 
      fetchDataSource(name, userId, params[name] || {})
        .catch(err => ({ source: name, error: err.message, formatted: 'Error loading data.' }))
    )
  );
  
  return results;
}

/**
 * Get list of available data sources with descriptions
 * @returns {Array} Array of {name, description} objects
 */
function getAvailableDataSources() {
  return Object.entries(DATA_SOURCES).map(([name, source]) => ({
    name,
    description: source.description
  }));
}

module.exports = {
  DATA_SOURCES,
  fetchDataSource,
  fetchMultipleDataSources,
  getAvailableDataSources
};
