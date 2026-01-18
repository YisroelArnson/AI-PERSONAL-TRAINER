// BACKEND/controllers/observability.controller.js
// HTTP handlers for observability/admin endpoints

const metrics = require('../services/observability/metrics.service');

/**
 * Get summary metrics for dashboard overview
 * GET /api/admin/metrics/summary
 */
async function getMetricsSummary(req, res) {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const summary = await metrics.getSummaryMetrics({
      userId,
      startDate,
      endDate
    });
    
    res.json(summary);
  } catch (error) {
    console.error('Get metrics summary error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get token usage over time
 * GET /api/admin/metrics/tokens
 */
async function getTokenUsage(req, res) {
  try {
    const { userId, startDate, endDate, granularity } = req.query;
    
    const data = await metrics.getTokenUsageOverTime({
      userId,
      startDate,
      endDate,
      granularity: granularity || 'day'
    });
    
    res.json({ data });
  } catch (error) {
    console.error('Get token usage error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get tool analytics
 * GET /api/admin/metrics/tools
 */
async function getToolMetrics(req, res) {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const data = await metrics.getToolAnalytics({
      userId,
      startDate,
      endDate
    });
    
    res.json({ tools: data });
  } catch (error) {
    console.error('Get tool metrics error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get latency distribution
 * GET /api/admin/metrics/latency
 */
async function getLatencyMetrics(req, res) {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const distribution = await metrics.getLatencyDistribution({
      userId,
      startDate,
      endDate
    });
    
    res.json(distribution);
  } catch (error) {
    console.error('Get latency metrics error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * List recent sessions with pagination
 * GET /api/admin/sessions
 */
async function listSessions(req, res) {
  try {
    const { userId, status, limit, offset } = req.query;
    
    const result = await metrics.getRecentSessions({
      userId,
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    res.json(result);
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get session details with all events
 * GET /api/admin/sessions/:id
 */
async function getSessionDetails(req, res) {
  try {
    const { id } = req.params;
    
    const session = await metrics.getSessionDetails(id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get session timeline (events only)
 * GET /api/admin/sessions/:id/timeline
 */
async function getSessionTimeline(req, res) {
  try {
    const { id } = req.params;
    
    const events = await metrics.getSessionTimeline(id);
    
    res.json({ events });
  } catch (error) {
    console.error('Get session timeline error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Health check for observability system
 * GET /api/admin/health
 */
async function healthCheck(req, res) {
  try {
    // Quick check to ensure we can query the database
    const summary = await metrics.getSummaryMetrics({
      startDate: new Date(Date.now() - 60000).toISOString() // Last minute
    });
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      recentSessions: summary.totalSessions
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  getMetricsSummary,
  getTokenUsage,
  getToolMetrics,
  getLatencyMetrics,
  listSessions,
  getSessionDetails,
  getSessionTimeline,
  healthCheck
};
