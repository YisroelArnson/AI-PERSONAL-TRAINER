const programService = require('../services/trainerProgram.service');
const journeyService = require('../services/trainerJourney.service');
const calendarService = require('../services/trainerCalendar.service');
const weightsProfileService = require('../services/trainerWeightsProfile.service');

async function draftProgram(req, res) {
  try {
    const userId = req.user.id;
    const program = await programService.draftProgram(userId);
    await journeyService.setPhaseStatus(userId, 'program', 'in_progress');
    res.json({ success: true, program });
  } catch (error) {
    console.error('Draft program error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function editProgram(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { instruction } = req.body || {};

    if (!instruction) {
      return res.status(400).json({ success: false, error: 'instruction is required' });
    }

    const program = await programService.getProgram(id);
    if (program.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await programService.editProgram(id, instruction);
    res.json({ success: true, program: updated });
  } catch (error) {
    console.error('Edit program error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function approveProgram(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const program = await programService.getProgram(id);
    if (program.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await programService.approveProgram(id);
    await journeyService.setPhaseStatus(userId, 'program', 'complete');
    res.json({ success: true, program: updated });
  } catch (error) {
    console.error('Approve program error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function activateProgram(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const program = await programService.getProgram(id);
    if (program.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await programService.activateProgram(id);
    await calendarService.syncCalendarFromProgram(userId);
    await journeyService.setPhaseStatus(userId, 'program', 'active');
    await journeyService.setPhaseStatus(userId, 'monitoring', 'active');

    // Async: create initial weights profile in background (don't block response)
    weightsProfileService.createInitialProfile(userId)
      .catch(err => console.error(`[weights-profile] Initial profile creation failed for user ${userId}:`, err.message));

    res.json({ success: true, program: updated });
  } catch (error) {
    console.error('Activate program error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  draftProgram,
  editProgram,
  approveProgram,
  activateProgram
};
