const checkinService = require('../services/trainerCheckins.service');

async function createOrResumeCheckin(req, res) {
  try {
    const userId = req.user.id;
    const { type } = req.body || {};
    const checkin = await checkinService.getOrCreateCheckin(userId, type || 'weekly');
    res.json({ success: true, checkin, questions: checkinService.DEFAULT_QUESTIONS });
  } catch (error) {
    console.error('Create checkin error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function submitCheckin(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { responses } = req.body || {};
    if (!responses) {
      return res.status(400).json({ success: false, error: 'responses is required' });
    }
    const checkin = await checkinService.submitCheckin(id, userId, responses);
    res.json({ success: true, checkin });
  } catch (error) {
    console.error('Submit checkin error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listCheckins(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit || '10', 10);
    const checkins = await checkinService.listCheckins(userId, limit);
    res.json({ success: true, checkins });
  } catch (error) {
    console.error('List checkins error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createOrResumeCheckin,
  submitCheckin,
  listCheckins
};
