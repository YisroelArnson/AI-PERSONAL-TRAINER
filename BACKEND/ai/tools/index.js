const { createRecommendExerciseTool } = require('./recommendExercise');
const { createLogExerciseTool } = require('./logExercise');
const { createParsePreferenceTool } = require('./parsePreference');

/**
 * Create all tools for a specific user
 * @param {string} userId - The user ID for context
 * @param {Object} options - Additional options for tools
 * @returns {Object} Object containing all tools
 */
function createAllTools(userId, options = {}) {
  return {
    recommendExercise: createRecommendExerciseTool(userId, options),
    logExercise: createLogExerciseTool(userId),
    parsePreference: createParsePreferenceTool(userId)
  };
}

module.exports = {
  createAllTools,
  createRecommendExerciseTool,
  createLogExerciseTool,
  createParsePreferenceTool
};
