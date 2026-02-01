const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerAssessment.controller');

router.use(authenticateToken);

router.post('/sessions', controller.createOrResumeSession);
router.get('/steps', controller.getSteps);
router.get('/sessions/:id', controller.getSession);
router.post('/sessions/:id/steps/:stepId/submit', controller.submitStep);
router.post('/sessions/:id/steps/:stepId/skip', controller.skipStep);
router.post('/sessions/:id/complete', controller.completeAssessment);

module.exports = router;
