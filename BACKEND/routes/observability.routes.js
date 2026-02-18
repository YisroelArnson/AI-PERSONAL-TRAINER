// BACKEND/routes/observability.routes.js
// Admin routes for observability dashboard

const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');
const {
  getMetricsSummary,
  getTokenUsage,
  getToolMetrics,
  getLatencyMetrics,
  listSessions,
  getSessionDetails,
  getSessionTimeline,
  healthCheck
} = require('../controllers/observability.controller');

router.use(authenticateAdmin);

// Health check
router.get('/health', healthCheck);

// Metrics endpoints
router.get('/metrics/summary', getMetricsSummary);
router.get('/metrics/tokens', getTokenUsage);
router.get('/metrics/tools', getToolMetrics);
router.get('/metrics/latency', getLatencyMetrics);

// Session endpoints (replaces traces)
router.get('/sessions', listSessions);
router.get('/sessions/:id', getSessionDetails);
router.get('/sessions/:id/timeline', getSessionTimeline);

module.exports = router;
