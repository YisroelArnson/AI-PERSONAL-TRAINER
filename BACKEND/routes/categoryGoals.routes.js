const express = require('express');
const router = express.Router();
const { parseCategoryGoals } = require('../controllers/categoryGoals.controller');
const { authenticateToken } = require('../middleware/auth');

/**
 * Parse category goals text using AI
 * POST /category-goals/parse
 * Body: { goalsText: string, currentGoals?: array }
 * Returns: Structured category goals with weights
 */
router.post('/parse', authenticateToken, parseCategoryGoals);

module.exports = router;

