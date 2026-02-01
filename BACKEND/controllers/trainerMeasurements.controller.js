const measurementService = require('../services/trainerMeasurements.service');

async function createMeasurement(req, res) {
  try {
    const userId = req.user.id;
    const measurement = await measurementService.logMeasurement(userId, req.body || {});
    res.json({ success: true, measurement });
  } catch (error) {
    console.error('Create measurement error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listMeasurements(req, res) {
  try {
    const userId = req.user.id;
    const types = req.query.types ? req.query.types.split(',') : [];
    const limit = parseInt(req.query.limit || '50', 10);
    const data = await measurementService.listMeasurements(userId, types, limit);
    res.json({ success: true, measurements: data });
  } catch (error) {
    console.error('List measurements error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function correctMeasurement(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const measurement = await measurementService.correctMeasurement(userId, id, req.body || {});
    res.json({ success: true, measurement });
  } catch (error) {
    console.error('Correct measurement error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createMeasurement,
  listMeasurements,
  correctMeasurement
};
