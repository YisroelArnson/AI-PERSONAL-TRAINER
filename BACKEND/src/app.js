const express = require('express');
const { randomUUID } = require('node:crypto');

const { messagesRouter } = require('./gateway/routes/messages.route');
const { sessionsRouter } = require('./gateway/routes/sessions.route');
const { coachSurfaceRouter } = require('./gateway/routes/coach-surface.route');
const { runsRouter } = require('./gateway/routes/runs.route');
const { workoutActionsRouter } = require('./gateway/routes/workout-actions.route');
const { settingsRouter } = require('./gateway/routes/settings.route');
const { errorHandler, notFoundHandler } = require('./gateway/middleware/error-handler');

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  req.requestId = req.header('x-request-id') || randomUUID();
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: 'AI Personal Trainer API',
    stage: 'gateway-scaffold',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    stage: 'gateway-scaffold',
    timestamp: new Date().toISOString()
  });
});

app.use('/v1/messages', messagesRouter);
app.use('/v1/sessions', sessionsRouter);
app.use('/v1/coach-surface', coachSurfaceRouter);
app.use('/v1/runs', runsRouter);
app.use('/v1/workout-actions', workoutActionsRouter);
app.use('/v1/settings', settingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = {
  app
};
