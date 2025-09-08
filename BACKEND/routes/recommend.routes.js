// A route to get exercise recommendations based on the user's goals and preferences

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getRecommendations } = require('../services/recommend.service');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const exerciseCount = parseInt(req.query.exerciseCount) || 8;
        
        // Validate exercise count
        if (exerciseCount < 1 || exerciseCount > 20) {
            return res.status(400).json({ 
                error: 'Invalid exercise count. Must be between 1 and 20.' 
            });
        }
        
        const recommendations = await getRecommendations(req.user.id, exerciseCount);
        res.json(recommendations);
    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

module.exports = router;