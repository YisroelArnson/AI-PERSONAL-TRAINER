const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const { authenticateToken } = require('./middleware/auth');

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'AI Personal Trainer API: ' + new Date().toISOString() });
  console.log('IOS client connected', new Date().toISOString());
});

const orchestrationAgentRouter = require('./routes/orchestrationAgent.routes');
app.use('/agent', orchestrationAgentRouter);

const recommendRouter = require('./routes/recommend.routes');
app.use('/recommend', recommendRouter);

const preferenceRouter = require('./routes/preference.routes');
app.use('/preferences', preferenceRouter);

const categoryGoalsRouter = require('./routes/categoryGoals.routes');
app.use('/category-goals', categoryGoalsRouter);

const muscleGoalsRouter = require('./routes/muscleGoals.routes');
app.use('/muscle-goals', muscleGoalsRouter);

const exerciseLogRouter = require('./routes/exerciseLog.routes');
app.use('/exercises', exerciseLogRouter);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://0.0.0.0:${PORT}`);
});

module.exports = app;
