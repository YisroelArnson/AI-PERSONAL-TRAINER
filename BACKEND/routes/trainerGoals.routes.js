const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerGoals.controller');

router.use(authenticateToken);

router.post('/draft', controller.draftGoal);
router.post('/:id/edit', controller.editGoal);
router.post('/:id/approve', controller.approveGoal);

module.exports = router;
