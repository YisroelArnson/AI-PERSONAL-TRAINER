const workoutService = require('../services/trainerWorkouts.service');

async function createOrResumeSession(req, res) {
  try {
    const userId = req.user.id;
    const { force_new, metadata } = req.body || {};

    const session = await workoutService.getOrCreateSession(userId, {
      forceNew: Boolean(force_new),
      metadata: metadata || {}
    });

    await workoutService.logEvent(session.id, workoutService.EVENT_TYPES.sessionStarted, {
      source: force_new ? 'new' : 'resume',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, session });
  } catch (error) {
    console.error('Create/resume workout session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getSession(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const session = await workoutService.getSession(id);

    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const instance = await workoutService.getLatestInstance(id);

    res.json({
      success: true,
      session,
      instance: instance?.instance_json || null,
      instance_version: instance?.version || null
    });
  } catch (error) {
    console.error('Get workout session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function generateWorkout(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const constraints = req.body || {};

    const session = await workoutService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const instance = await workoutService.generateWorkoutInstance(userId, constraints);
    const instanceRecord = await workoutService.createWorkoutInstance(id, instance);

    await workoutService.logEvent(id, workoutService.EVENT_TYPES.instanceGenerated, {
      constraints,
      version: instanceRecord.version,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      instance: instanceRecord.instance_json,
      version: instanceRecord.version
    });
  } catch (error) {
    console.error('Generate workout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function performAction(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { action_type, payload } = req.body || {};

    if (!action_type) {
      return res.status(400).json({ success: false, error: 'action_type is required' });
    }

    const session = await workoutService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const result = await workoutService.applyAction({
      sessionId: id,
      userId,
      actionType: action_type,
      payload: payload || {}
    });

    res.json({
      success: true,
      action: action_type,
      instance: result.instance || null,
      instance_version: result.instanceVersion || null,
      instance_updated: result.instanceUpdated
    });
  } catch (error) {
    console.error('Workout action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function completeSession(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reflection, log } = req.body || {};

    const session = await workoutService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const instanceRecord = await workoutService.getLatestInstance(id);
    const instance = instanceRecord?.instance_json || null;

    const logPayload = {
      reflection: reflection || {},
      ...log
    };

    await workoutService.saveWorkoutLog(id, logPayload);

    const summary = await workoutService.generateSessionSummary({
      sessionId: id,
      instance,
      log: logPayload,
      reflection: reflection || {}
    });

    await workoutService.saveSessionSummary(id, summary);
    await workoutService.updateSession(id, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });

    await workoutService.logEvent(id, workoutService.EVENT_TYPES.sessionCompleted, {
      summary,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Complete workout session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function streamEvents(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const session = await workoutService.getSession(id);
    if (session.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  const since = parseInt(req.query.since || '0', 10);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let lastSequence = Number.isNaN(since) ? 0 : since;
  let isConnected = true;

  req.on('close', () => {
    isConnected = false;
  });

  const poll = async () => {
    if (!isConnected) return;
    try {
      const events = await workoutService.fetchEventsAfter(id, lastSequence);

      for (const event of events) {
        lastSequence = event.sequence_number;
        res.write(`data: ${JSON.stringify({
          type: event.event_type,
          sequence: event.sequence_number,
          data: event.data,
          timestamp: event.timestamp
        })}\n\n`);
      }
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }

    if (isConnected) {
      setTimeout(poll, 1500);
    }
  };

  poll();
}

module.exports = {
  createOrResumeSession,
  getSession,
  generateWorkout,
  performAction,
  completeSession,
  streamEvents
};
