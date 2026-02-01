const journeyService = require('../services/trainerJourney.service');

async function getJourney(req, res) {
  try {
    const userId = req.user.id;
    const journey = await journeyService.getOrCreateJourney(userId);
    res.json({ success: true, journey });
  } catch (error) {
    console.error('Get journey error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function updateJourney(req, res) {
  try {
    const userId = req.user.id;
    const patch = req.body || {};
    const journey = await journeyService.updateJourney(userId, patch);
    res.json({ success: true, journey });
  } catch (error) {
    console.error('Update journey error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getJourney,
  updateJourney
};
