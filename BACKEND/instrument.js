const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Initialize Sentry before requiring any other modules
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Environment tag for filtering in Sentry dashboard
  environment: process.env.NODE_ENV || "development",
  integrations: [
    Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
  // Adds request headers and IP for users
  sendDefaultPii: true,

  integrations: [
    // Add profiling integration for performance insights
    nodeProfilingIntegration(),
  ],

  // Capture 100% of transactions for tracing
  // Reduce this in production for high-traffic apps (e.g., 0.1 for 10%)
  tracesSampleRate: 1.0,

  // Profile 100% of sampled transactions
  // This is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

module.exports = Sentry;
