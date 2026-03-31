const {
  getUserDefaultLlmSelectionSummary,
  updateUserDefaultLlmSelection
} = require('../../runtime/services/llm-config.service');

async function getLlmSettings({ auth }) {
  return getUserDefaultLlmSelectionSummary(auth.userId);
}

async function updateLlmSettings({ auth, body }) {
  return updateUserDefaultLlmSelection(auth.userId, body.userDefaultLlm);
}

module.exports = {
  getLlmSettings,
  updateLlmSettings
};
