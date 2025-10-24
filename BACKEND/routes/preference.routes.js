const express = require('express');
const router = express.Router();
const { parsePreference } = require('../controllers/preference.controller');
const { authenticateToken } = require('../middleware/auth');

/**
 * Parse user preference text using AI
 * POST /preferences/parse
 * Body: { preferenceText: string }
 * Returns: Structured preference object
 */
router.post('/parse', authenticateToken, parsePreference);

module.exports = router;

