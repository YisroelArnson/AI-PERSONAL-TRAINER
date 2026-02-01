const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerMemory.controller');

router.use(authenticateToken);

router.post('/', controller.upsertMemory);
router.get('/', controller.listMemory);
router.delete('/:key', controller.forgetMemory);

module.exports = router;
