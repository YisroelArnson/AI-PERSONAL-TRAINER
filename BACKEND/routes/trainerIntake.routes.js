const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerIntake.controller');

router.use(authenticateToken);

// New structured intake (screen-by-screen)
router.post('/submit', controller.submitStructuredIntake);

// Legacy conversational intake
router.post('/sessions', controller.createOrResumeSession);
router.post('/sessions/:id/answers', controller.submitAnswer);
router.post('/sessions/:id/confirm', controller.confirmIntake);
router.post('/sessions/:id/edit', controller.editIntake);
router.get('/sessions/:id/summary', controller.getLatestSummary);

module.exports = router;
