const express = require('express');
const router = express.Router();
const { getDistribution, resetDistributionTracking } = require('../controllers/exerciseDistribution.controller');

/**
 * @route GET /exercises/distribution/:userId
 * @desc Get current distribution metrics for a user
 * @access Protected (requires authentication)
 */
router.get('/distribution/:userId', getDistribution);

/**
 * @route POST /exercises/distribution/reset/:userId
 * @desc Reset distribution tracking for a user (called when goals are updated)
 * @access Protected (requires authentication)
 */
router.post('/distribution/reset/:userId', resetDistributionTracking);

module.exports = router;

