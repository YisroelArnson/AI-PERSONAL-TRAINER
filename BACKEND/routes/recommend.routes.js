const express = require('express');
const router = express.Router();
const { recommendExercises, streamRecommendExercises } = require('../controllers/recommend.controller');
const { authenticateToken } = require('../middleware/auth');

// Main exercise recommendation endpoint
// POST /recommend/exercises/:userId
router.post('/exercises/:userId', authenticateToken, recommendExercises);

// Streaming exercise recommendation endpoint
// POST /recommend/stream/:userId
router.post('/stream/:userId', authenticateToken, streamRecommendExercises);

module.exports = router;
