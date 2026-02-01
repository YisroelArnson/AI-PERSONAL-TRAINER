const assessmentService = require('../services/trainerAssessment.service');
const journeyService = require('../services/trainerJourney.service');

async function createOrResumeSession(req, res) {
  try {
    const userId = req.user.id;
    const session = await assessmentService.getOrCreateSession(userId);
    await journeyService.setPhaseStatus(userId, 'assessment', 'in_progress');
    res.json({ success: true, session });
  } catch (error) {
    console.error('Assessment session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getSteps(req, res) {
  res.json({ success: true, steps: assessmentService.ASSESSMENT_STEPS });
}

async function getSession(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const session = await assessmentService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, session });
  } catch (error) {
    console.error('Assessment get session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function submitStep(req, res) {
  try {
    const userId = req.user.id;
    const { id, stepId } = req.params;
    const { result } = req.body || {};

    const session = await assessmentService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!result) {
      return res.status(400).json({ success: false, error: 'result is required' });
    }

    const output = await assessmentService.submitStepResult(id, stepId, result);
    res.json({ success: true, next_step: output.nextStep });
  } catch (error) {
    console.error('Assessment submit step error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function skipStep(req, res) {
  try {
    const userId = req.user.id;
    const { id, stepId } = req.params;
    const { reason } = req.body || {};

    const session = await assessmentService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const nextStep = await assessmentService.skipStep(id, stepId, reason || 'not specified');
    res.json({ success: true, next_step: nextStep });
  } catch (error) {
    console.error('Assessment skip step error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function completeAssessment(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const session = await assessmentService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const baseline = await assessmentService.synthesizeBaseline(id);
    await journeyService.setPhaseStatus(userId, 'assessment', 'complete');
    res.json({ success: true, baseline: baseline.baseline_json, version: baseline.version });
  } catch (error) {
    console.error('Assessment complete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createOrResumeSession,
  getSteps,
  getSession,
  submitStep,
  skipStep,
  completeAssessment
};
