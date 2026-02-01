const memoryService = require('../services/trainerMemory.service');

async function upsertMemory(req, res) {
  try {
    const userId = req.user.id;
    const memory = await memoryService.upsertMemory(userId, req.body || {});
    res.json({ success: true, memory });
  } catch (error) {
    console.error('Upsert memory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function listMemory(req, res) {
  try {
    const userId = req.user.id;
    const types = req.query.types ? req.query.types.split(',') : [];
    const items = await memoryService.listMemory(userId, types);
    res.json({ success: true, items });
  } catch (error) {
    console.error('List memory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function forgetMemory(req, res) {
  try {
    const userId = req.user.id;
    const { key } = req.params;
    const item = await memoryService.forgetMemory(userId, key);
    res.json({ success: true, item });
  } catch (error) {
    console.error('Forget memory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  upsertMemory,
  listMemory,
  forgetMemory
};
