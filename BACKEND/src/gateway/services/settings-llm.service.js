/**
 * File overview:
 * Implements the settings llm service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - getLlmSettings: Gets LLM settings needed by this file.
 * - updateLlmSettings: Updates LLM settings with the latest state.
 */

const {
  getUserDefaultLlmSelectionSummary,
  updateUserDefaultLlmSelection
} = require('../../runtime/services/llm-config.service');

/**
 * Gets LLM settings needed by this file.
 */
async function getLlmSettings({ auth }) {
  return getUserDefaultLlmSelectionSummary(auth.userId);
}

/**
 * Updates LLM settings with the latest state.
 */
async function updateLlmSettings({ auth, body }) {
  return updateUserDefaultLlmSelection(auth.userId, body.userDefaultLlm);
}

module.exports = {
  getLlmSettings,
  updateLlmSettings
};
