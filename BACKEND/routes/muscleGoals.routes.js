const express = require('express');
const router = express.Router();
const { parseMuscleGoals } = require('../controllers/muscleGoals.controller');
const { authenticateToken } = require('../middleware/auth');

/**
 * Parse muscle goals text using AI
 * POST /muscle-goals/parse
 * Body: { goalsText: string, currentGoals?: object }
 * Returns: Structured muscle weights for 16 preset muscles
 */
router.post('/parse', authenticateToken, parseMuscleGoals);

module.exports = router;

