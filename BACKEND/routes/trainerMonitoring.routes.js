const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerMonitoring.controller');

router.use(authenticateToken);

router.post('/weekly', controller.generateWeeklyReport);
router.get('/weekly', controller.listReports);

module.exports = router;
