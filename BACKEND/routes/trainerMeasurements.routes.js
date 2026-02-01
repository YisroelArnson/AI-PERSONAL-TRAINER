const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerMeasurements.controller');

router.use(authenticateToken);

router.post('/', controller.createMeasurement);
router.get('/', controller.listMeasurements);
router.post('/:id/correct', controller.correctMeasurement);

module.exports = router;
