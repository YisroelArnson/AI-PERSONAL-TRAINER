// Initialize Sentry first - before any other modules!
const Sentry = require('./instrument');
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const { authenticateToken } = require('./middleware/auth');

// Middleware
app.use(express.json());

// Serve static files for dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'AI Personal Trainer API: ' + new Date().toISOString() });
  console.log('IOS client connected', new Date().toISOString());
});

// Agent system
const agentRouter = require('./routes/agent.routes');
app.use('/agent', agentRouter);

const userSettingsRouter = require('./routes/userSettings.routes');
app.use('/user-settings', userSettingsRouter);

const workoutTrackingV2Router = require('./routes/workoutTrackingV2.routes');
app.use('/trainer', workoutTrackingV2Router);

const trainerIntakeRouter = require('./routes/trainerIntake.routes');
app.use('/trainer/intake', trainerIntakeRouter);

const trainerAssessmentRouter = require('./routes/trainerAssessment.routes');
app.use('/trainer/assessment', trainerAssessmentRouter);

const trainerGoalsRouter = require('./routes/trainerGoals.routes');
app.use('/trainer/goals', trainerGoalsRouter);

const trainerProgramRouter = require('./routes/trainerProgram.routes');
app.use('/trainer/programs', trainerProgramRouter);

const trainerMeasurementsRouter = require('./routes/trainerMeasurements.routes');
app.use('/trainer/measurements', trainerMeasurementsRouter);

const trainerMemoryRouter = require('./routes/trainerMemory.routes');
app.use('/trainer/memory', trainerMemoryRouter);

const trainerCalendarRouter = require('./routes/trainerCalendar.routes');
app.use('/trainer/calendar', trainerCalendarRouter);

const trainerMonitoringRouter = require('./routes/trainerMonitoring.routes');
app.use('/trainer/monitoring', trainerMonitoringRouter);

const trainerJourneyRouter = require('./routes/trainerJourney.routes');
app.use('/trainer/journey', trainerJourneyRouter);

const trainerCheckinsRouter = require('./routes/trainerCheckins.routes');
app.use('/trainer/checkins', trainerCheckinsRouter);

const trainerWeightsProfileRouter = require('./routes/trainerWeightsProfile.routes');
app.use('/trainer/weights-profile', trainerWeightsProfileRouter);

// Cron jobs
const { registerWeeklyReviewCron } = require('./cron/weeklyReview.cron');
registerWeeklyReviewCron();

// Observability/Admin routes
const observabilityRouter = require('./routes/observability.routes');
app.use('/api/admin', observabilityRouter);

// Sentry error handler - must be after all routes and before any other error handlers
Sentry.setupExpressErrorHandler(app);

// Optional: Custom fallback error handler
app.use((err, req, res, next) => {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.status(500).json({
    error: 'Internal Server Error',
    sentryId: res.sentry,
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://0.0.0.0:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard/`);
});

module.exports = app;
