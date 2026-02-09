const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerGoals.controller');

router.use(authenticateToken);

// New goal options flow (screen-by-screen onboarding)
router.post('/options', controller.generateOptions);
router.post('/options/select', controller.selectOption);

// Legacy single-draft flow
router.post('/draft', controller.draftGoal);
router.post('/:id/edit', controller.editGoal);
router.post('/:id/approve', controller.approveGoal);

module.exports = router;
