const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerCalendar.controller');

router.use(authenticateToken);

router.get('/', controller.listEvents);
router.post('/events', controller.createEvent);
router.post('/events/:id/reschedule', controller.rescheduleEvent);
router.post('/events/:id/skip', controller.skipEvent);
router.post('/events/:id/complete', controller.completeEvent);
router.post('/sync', controller.syncCalendar);
router.post('/check-and-regenerate', controller.checkAndRegenerate);

module.exports = router;
