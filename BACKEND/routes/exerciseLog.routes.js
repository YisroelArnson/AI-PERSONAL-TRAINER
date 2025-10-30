const express = require('express');
const router = express.Router();
const { logExercise, getHistory } = require('../controllers/exerciseLog.controller');
const { authenticateToken } = require('../middleware/auth');

// Log a completed exercise
// POST /exercises/log/:userId
router.post('/log/:userId', authenticateToken, logExercise);

// Get workout history for a user
// GET /exercises/history/:userId
router.get('/history/:userId', authenticateToken, getHistory);

module.exports = router;

