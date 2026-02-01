const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerCheckins.controller');

router.use(authenticateToken);

router.post('/', controller.createOrResumeCheckin);
router.post('/:id/submit', controller.submitCheckin);
router.get('/', controller.listCheckins);

module.exports = router;
