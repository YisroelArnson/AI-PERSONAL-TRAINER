const express = require('express');
const router = express.Router();
const { logExercise, getHistory, deleteExercise } = require('../controllers/exerciseLog.controller');
const { getDistribution, resetDistributionTracking } = require('../controllers/exerciseDistribution.controller');
const { authenticateToken } = require('../middleware/auth');

// Log a completed exercise
// POST /exercises/log/:userId
router.post('/log/:userId', authenticateToken, logExercise);

// Delete a completed exercise (undo completion)
// DELETE /exercises/log/:userId/:exerciseId
router.delete('/log/:userId/:exerciseId', authenticateToken, deleteExercise);

// Get workout history for a user
// GET /exercises/history/:userId
router.get('/history/:userId', authenticateToken, getHistory);

// Get distribution metrics for a user
// GET /exercises/distribution/:userId
router.get('/distribution/:userId', authenticateToken, getDistribution);

// Reset distribution tracking for a user
// POST /exercises/distribution/reset/:userId
router.post('/distribution/reset/:userId', authenticateToken, resetDistributionTracking);

module.exports = router;

