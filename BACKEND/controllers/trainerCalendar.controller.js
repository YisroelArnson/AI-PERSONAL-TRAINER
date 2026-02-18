const calendarService = require('../services/trainerCalendar.service');
const weeklyReviewService = require('../services/weeklyReview.service');

async function listEvents(req, res) {
  try {
    const userId = req.user.id;
    const { start, end } = req.query;
    const events = await calendarService.listEvents(userId, start, end);
    res.json({ success: true, events });
  } catch (error) {
    console.error('List calendar events error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function createEvent(req, res) {
  try {
    const userId = req.user.id;
    const event = await calendarService.createEvent(userId, req.body || {});
    res.json({ success: true, event });
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function rescheduleEvent(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const event = await calendarService.rescheduleEvent(userId, id, req.body || {});
    res.json({ success: true, event });
  } catch (error) {
    console.error('Reschedule event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function skipEvent(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body || {};
    const event = await calendarService.skipEvent(userId, id, reason || null);
    res.json({ success: true, event });
  } catch (error) {
    console.error('Skip event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function completeEvent(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const event = await calendarService.completeEvent(userId, id);
    res.json({ success: true, event });
  } catch (error) {
    console.error('Complete event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function deleteEvent(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const cascadePlanned = req.query.cascade_planned === 'true';
    await calendarService.deleteEvent(userId, id, { cascadePlanned });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function syncCalendar(req, res) {
  try {
    const userId = req.user.id;
    const result = await calendarService.syncCalendarFromProgram(userId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Sync calendar error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function checkAndRegenerate(req, res) {
  try {
    const userId = req.user.id;
    const result = await weeklyReviewService.checkAndRunCatchUpReview(userId);

    if (result.regenerated) {
      // Return the newly generated events
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 14);
      const events = await calendarService.listEvents(userId, start.toISOString(), end.toISOString());
      return res.json({ success: true, regenerated: true, events });
    }

    res.json({ success: true, regenerated: false, reason: result.reason });
  } catch (error) {
    console.error('Check and regenerate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listEvents,
  createEvent,
  rescheduleEvent,
  skipEvent,
  completeEvent,
  deleteEvent,
  syncCalendar,
  checkAndRegenerate
};
