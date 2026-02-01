const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/trainerProgram.controller');

router.use(authenticateToken);

router.post('/draft', controller.draftProgram);
router.post('/:id/edit', controller.editProgram);
router.post('/:id/approve', controller.approveProgram);
router.post('/:id/activate', controller.activateProgram);

module.exports = router;
