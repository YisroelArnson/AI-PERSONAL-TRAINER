const calendarService = require('../services/trainerCalendar.service');

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

module.exports = {
  listEvents,
  createEvent,
  rescheduleEvent,
  skipEvent,
  completeEvent,
  syncCalendar
};
