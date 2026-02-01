const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerJourney.controller');

router.use(authenticateToken);

router.get('/', controller.getJourney);
router.post('/', controller.updateJourney);

module.exports = router;
