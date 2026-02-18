const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerWeightsProfile.controller');

router.use(authenticateToken);

router.get('/', controller.getLatestProfile);
router.get('/history', controller.getProfileHistory);
router.post('/initialize', controller.initializeProfile);

module.exports = router;
