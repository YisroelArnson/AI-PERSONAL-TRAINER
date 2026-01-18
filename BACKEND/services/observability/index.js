// BACKEND/services/observability/index.js
// Observability module exports
// Re-exports from the unified session observability service and supporting modules

const sessionObs = require('../sessionObservability.service');
const logger = require('./logger.service');
const metrics = require('./metrics.service');
const pricing = require('./pricing');

module.exports = {
  // Session observability exports (unified service)
  createSession: sessionObs.createSession,
  getOrCreateSession: sessionObs.getOrCreateSession,
  getSession: sessionObs.getSession,
  endSession: sessionObs.endSession,
  updateContextStart: sessionObs.updateContextStart,
  getUserSessions: sessionObs.getUserSessions,
  
  // Event logging
  logEvent: sessionObs.logEvent,
  logUserMessage: sessionObs.logUserMessage,
  logLLMRequest: sessionObs.logLLMRequest,
  logLLMResponse: sessionObs.logLLMResponse,
  logToolCall: sessionObs.logToolCall,
  logToolResult: sessionObs.logToolResult,
  logError: sessionObs.logError,
  logKnowledge: sessionObs.logKnowledge,
  
  // Event retrieval
  getSessionTimeline: sessionObs.getSessionTimeline,
  getContextEvents: sessionObs.getContextEvents,
  getSessionWithStats: sessionObs.getSessionWithStats,

  // Logger exports
  logger,
  log: {
    debug: logger.debug,
    info: logger.info,
    warn: logger.warn,
    error: logger.error,
    setContext: logger.setContext,
    clearContext: logger.clearContext
  },

  // Metrics exports
  metrics,
  
  // Pricing exports
  pricing,
  calculateCost: pricing.calculateCost,
  calculateCostCents: pricing.calculateCostCents,
  
  // Utilities
  formatTokens: sessionObs.formatTokens,
  formatCost: sessionObs.formatCost,
  formatDuration: sessionObs.formatDuration,
  consoleLog: sessionObs.consoleLog
};
