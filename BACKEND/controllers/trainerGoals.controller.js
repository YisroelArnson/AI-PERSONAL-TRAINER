const goalsService = require('../services/trainerGoals.service');
const journeyService = require('../services/trainerJourney.service');

async function draftGoal(req, res) {
  try {
    const userId = req.user.id;
    const goal = await goalsService.draftGoalContract(userId);
    await journeyService.setPhaseStatus(userId, 'goals', 'in_progress');
    res.json({ success: true, goal });
  } catch (error) {
    console.error('Draft goal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function editGoal(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { instruction } = req.body || {};

    if (!instruction) {
      return res.status(400).json({ success: false, error: 'instruction is required' });
    }

    const goal = await goalsService.getGoalContract(id);
    if (goal.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await goalsService.editGoalContract(id, instruction);
    res.json({ success: true, goal: updated });
  } catch (error) {
    console.error('Edit goal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function approveGoal(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const goal = await goalsService.getGoalContract(id);
    if (goal.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await goalsService.approveGoalContract(id);
    await journeyService.setPhaseStatus(userId, 'goals', 'complete');
    res.json({ success: true, goal: updated });
  } catch (error) {
    console.error('Approve goal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function generateOptions(req, res) {
  try {
    const userId = req.user.id;
    const options = await goalsService.generateGoalOptions(userId);
    await journeyService.setPhaseStatus(userId, 'goals', 'in_progress');
    res.json({ success: true, options });
  } catch (error) {
    console.error('Generate goal options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function selectOption(req, res) {
  try {
    const userId = req.user.id;
    const { option } = req.body || {};

    if (!option) {
      return res.status(400).json({ success: false, error: 'option is required' });
    }

    const goal = await goalsService.selectGoalOption(userId, option);
    await journeyService.setPhaseStatus(userId, 'goals', 'complete');
    res.json({ success: true, goal });
  } catch (error) {
    console.error('Select goal option error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  draftGoal,
  editGoal,
  approveGoal,
  generateOptions,
  selectOption
};
