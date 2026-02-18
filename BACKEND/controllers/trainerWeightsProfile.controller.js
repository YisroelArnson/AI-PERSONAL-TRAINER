const weightsProfileService = require('../services/trainerWeightsProfile.service');

async function getLatestProfile(req, res) {
  try {
    const userId = req.user.id;
    const profile = await weightsProfileService.getLatestProfile(userId);
    res.json({ success: true, profile: profile || null });
  } catch (error) {
    console.error('Get weights profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getProfileHistory(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit || '10', 10);
    const history = await weightsProfileService.getProfileHistory(userId, limit);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Get weights profile history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function initializeProfile(req, res) {
  try {
    const userId = req.user.id;
    const profile = await weightsProfileService.createInitialProfile(userId);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Initialize weights profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getLatestProfile,
  getProfileHistory,
  initializeProfile
};
