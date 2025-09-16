const express = require('express');
const router = express.Router();
const { recommendExercises } = require('../controllers/recommend.controller');
const { authenticateToken } = require('../middleware/auth');

// Main exercise recommendation endpoint
// POST /recommend/exercises/:userId
router.post('/exercises/:userId', authenticateToken, recommendExercises);

module.exports = router;
