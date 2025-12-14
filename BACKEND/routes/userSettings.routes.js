const express = require('express');
const router = express.Router();
const { getSettings, putSettings } = require('../controllers/userSettings.controller');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/user-settings - Get user's settings
router.get('/', getSettings);

// PUT /api/user-settings - Update user's settings
router.put('/', putSettings);

module.exports = router;

