const express = require('express');
const router = express.Router();
const { chat, streamChat } = require('../controllers/orchestrationAgent.controller');

// Chat endpoint - main agent interaction
router.post('/chat', chat);

// Streaming chat endpoint - agent interaction with exercise streaming
router.post('/stream', streamChat);

module.exports = router;
