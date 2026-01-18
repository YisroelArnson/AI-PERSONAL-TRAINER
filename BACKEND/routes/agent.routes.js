// BACKEND/routes/agent.routes.js
// Routes for the new agent system
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const agentController = require('../controllers/agent.controller');

// All routes require authentication
router.use(authenticateToken);

// Chat endpoints
router.post('/chat', agentController.handleChat);
router.post('/stream', agentController.handleStreamChat);

// Session management
router.get('/sessions', agentController.getSessions);
router.get('/sessions/:id', agentController.getSessionById);
router.post('/sessions', agentController.startNewSession);

module.exports = router;
