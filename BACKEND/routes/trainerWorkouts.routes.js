const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerWorkouts.controller');

router.use(authenticateToken);

router.post('/plan-intent', controller.planIntent);
router.post('/sessions', controller.createOrResumeSession);
router.get('/sessions/:id', controller.getSession);
router.post('/sessions/:id/generate', controller.generateWorkout);
router.post('/sessions/:id/actions', controller.performAction);
router.post('/sessions/:id/complete', controller.completeSession);
router.get('/sessions/:id/events', controller.streamEvents);

module.exports = router;
