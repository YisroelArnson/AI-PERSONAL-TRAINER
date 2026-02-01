const intakeService = require('../services/trainerIntake.service');
const journeyService = require('../services/trainerJourney.service');

async function createOrResumeSession(req, res) {
  try {
    const userId = req.user.id;
    const session = await intakeService.getOrCreateSession(userId);
    await journeyService.setPhaseStatus(userId, 'intake', 'in_progress');
    const checklist = await intakeService.getChecklist(session.id);
    const lastAssistant = await intakeService.getLatestAssistantMessage(session.id);
    res.json({
      success: true,
      session,
      checklist,
      prompt: lastAssistant?.data?.text || null
    });
  } catch (error) {
    console.error('Intake session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function submitAnswer(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { answer_text } = req.body || {};

    if (!answer_text) {
      return res.status(400).json({ success: false, error: 'answer_text is required' });
    }

    const session = await intakeService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await intakeService.handleAnswer({
      sessionId: id,
      userId,
      answerText: answer_text
    });

    res.write(`data: ${JSON.stringify({ type: 'assistant_message', data: result.assistant.data })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'checklist', data: { items: result.checklist } })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'progress', data: { progress: result.progress } })}\n\n`);
    if (result.safety?.triggered) {
      res.write(`data: ${JSON.stringify({ type: 'safety_flag', data: result.safety })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Intake answer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function confirmIntake(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const session = await intakeService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const summary = await intakeService.confirmSummary(id);
    await journeyService.setPhaseStatus(userId, 'intake', 'complete');
    res.json({ success: true, summary: summary.summary_json, version: summary.version });
  } catch (error) {
    console.error('Confirm intake error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function editIntake(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { changes } = req.body || {};

    if (!changes) {
      return res.status(400).json({ success: false, error: 'changes is required' });
    }

    const session = await intakeService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const summary = await intakeService.editSummary(id, changes);
    res.json({ success: true, summary: summary.summary_json, version: summary.version });
  } catch (error) {
    console.error('Edit intake error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getLatestSummary(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const session = await intakeService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const summary = await intakeService.getLatestSummary(id);
    res.json({ success: true, summary: summary?.summary_json || null, version: summary?.version || null });
  } catch (error) {
    console.error('Get intake summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createOrResumeSession,
  submitAnswer,
  confirmIntake,
  editIntake,
  getLatestSummary
};
