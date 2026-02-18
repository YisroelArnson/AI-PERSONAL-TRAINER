const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Initialize Sentry before requiring any other modules
const integrations = [
  // Add profiling integration for performance insights
  nodeProfilingIntegration()
];

if (typeof Sentry.openAIIntegration === 'function') {
  integrations.push(
    Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true
    })
  );
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment tag for filtering in Sentry dashboard
  environment: process.env.NODE_ENV || "development",
  integrations,

  // Adds request headers and IP for users
  sendDefaultPii: true,

  // Capture 100% of transactions for tracing
  // Reduce this in production for high-traffic apps (e.g., 0.1 for 10%)
  tracesSampleRate: 1.0,

  // Profile 100% of sampled transactions
  // This is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

module.exports = Sentry;
