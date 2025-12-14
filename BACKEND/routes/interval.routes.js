const express = require('express');
const router = express.Router();
const { getExerciseIntervals, getBatchIntervals } = require('../controllers/interval.controller');
const { authenticateToken } = require('../middleware/auth');

// Generate interval timer data for a single exercise
// POST /intervals/exercise
router.post('/exercise', authenticateToken, getExerciseIntervals);

// Generate interval timer data for multiple exercises (batch)
// POST /intervals/batch
router.post('/batch', authenticateToken, getBatchIntervals);

module.exports = router;


