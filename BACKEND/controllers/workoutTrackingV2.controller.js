const workoutTrackingService = require('../services/workoutTrackingV2.service');

function getStatusCode(error) {
  if (Number.isFinite(error?.statusCode)) return error.statusCode;
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('forbidden')) return 403;
  if (message.includes('not found')) return 404;
  if (message.includes('version conflict')) return 409;
  if (message.includes('required') || message.includes('invalid') || message.includes('out of range')) return 422;
  return 500;
}

function zodErrorToMessage(error) {
  if (!error?.issues?.length) return error?.message || 'Validation failed';
  return error.issues
    .map(issue => `${issue.path?.join('.') || 'field'}: ${issue.message}`)
    .join('; ');
}

async function createWorkoutSession(req, res) {
  try {
    const detail = await workoutTrackingService.createWorkoutSession({
      userId: req.user.id,
      requestBody: req.body || {}
    });

    res.json({
      success: true,
      ...detail
    });
  } catch (error) {
    const status = getStatusCode(error);
    const message = error?.issues ? zodErrorToMessage(error) : (error.message || 'Failed to create workout session');
    res.status(status).json({ success: false, error: message });
  }
}

async function getWorkoutSession(req, res) {
  try {
    const detail = await workoutTrackingService.getSessionDetail({
      sessionId: req.params.sessionId,
      userId: req.user.id
    });

    res.json({
      success: true,
      ...detail
    });
  } catch (error) {
    const status = getStatusCode(error);
    res.status(status).json({ success: false, error: error.message || 'Failed to fetch workout session' });
  }
}

async function applyExerciseCommand(req, res) {
  try {
    const { exerciseId } = req.params;
    const { command_id, expected_version, command, client_meta } = req.body || {};

    const result = await workoutTrackingService.applyExerciseCommand({
      userId: req.user.id,
      exerciseId,
      commandId: command_id,
      expectedVersion: expected_version,
      command,
      clientMeta: client_meta || {}
    });

    res.json({ success: true, ...result });
  } catch (error) {
    const status = getStatusCode(error);
    const payload = {
      success: false,
      error: error?.issues ? zodErrorToMessage(error) : (error.message || 'Failed to apply command')
    };

    if (status === 409 && Number.isFinite(error.currentPayloadVersion)) {
      payload.current_payload_version = error.currentPayloadVersion;
    }

    res.status(status).json(payload);
  }
}

async function completeWorkoutSession(req, res) {
  try {
    const { reflection } = req.body || {};
    const summary = await workoutTrackingService.finalizeSession({
      userId: req.user.id,
      sessionId: req.params.sessionId,
      reflection: reflection || {},
      mode: 'complete'
    });

    res.json({ success: true, summary });
  } catch (error) {
    const status = getStatusCode(error);
    res.status(status).json({ success: false, error: error.message || 'Failed to complete session' });
  }
}

async function stopWorkoutSession(req, res) {
  try {
    const { reflection, reason } = req.body || {};
    const summary = await workoutTrackingService.finalizeSession({
      userId: req.user.id,
      sessionId: req.params.sessionId,
      reflection: reflection || {},
      mode: 'stop',
      reason: reason || 'user_stopped'
    });

    res.json({ success: true, summary });
  } catch (error) {
    const status = getStatusCode(error);
    res.status(status).json({ success: false, error: error.message || 'Failed to stop session' });
  }
}

async function getWorkoutHistory(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const cursor = req.query.cursor || null;

    const history = await workoutTrackingService.listHistory({
      userId: req.user.id,
      limit,
      cursor
    });

    res.json({
      success: true,
      ...history
    });
  } catch (error) {
    const status = getStatusCode(error);
    res.status(status).json({ success: false, error: error.message || 'Failed to load workout history' });
  }
}

async function planWorkoutIntent(req, res) {
  try {
    const { intentText, intent_text } = req.body || {};
    const plan = await workoutTrackingService.planWorkoutIntent({
      userId: req.user.id,
      intentText: intentText || intent_text
    });
    res.json({ success: true, plan });
  } catch (error) {
    const status = getStatusCode(error);
    const message = error?.issues ? zodErrorToMessage(error) : (error.message || 'Failed to plan workout intent');
    res.status(status).json({ success: false, error: message });
  }
}

module.exports = {
  planWorkoutIntent,
  createWorkoutSession,
  getWorkoutSession,
  applyExerciseCommand,
  completeWorkoutSession,
  stopWorkoutSession,
  getWorkoutHistory
};
