const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/workoutTrackingV2.controller');

router.use(authenticateToken);

router.post('/workout-intent/plan', controller.planWorkoutIntent);
router.post('/workout-sessions', controller.createWorkoutSession);
router.get('/workout-sessions/:sessionId', controller.getWorkoutSession);
router.post('/workout-sessions/:sessionId/complete', controller.completeWorkoutSession);
router.post('/workout-sessions/:sessionId/stop', controller.stopWorkoutSession);
router.post('/workout-exercises/:exerciseId/commands', controller.applyExerciseCommand);
router.get('/workout-history', controller.getWorkoutHistory);

module.exports = router;
