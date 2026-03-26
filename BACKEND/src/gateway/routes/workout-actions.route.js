const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { parseCompleteCurrentSetRequest } = require('../schemas/workout-actions.schema');
const { badRequest } = require('../../shared/errors');
const { processCompleteCurrentSetAction } = require('../services/workout-actions.service');

const workoutActionsRouter = express.Router();

workoutActionsRouter.post('/complete-current-set', authenticateUser, async (req, res, next) => {
  try {
    const body = parseCompleteCurrentSetRequest(req.body);
    const result = await processCompleteCurrentSetAction({
      auth: req.auth,
      headers: req.headers,
      body
    });

    res.status(200).json(result);
  } catch (error) {
    if (error && error.name === 'ZodError') {
      return next(badRequest('Invalid request body', error.flatten()));
    }

    return next(error);
  }
});

module.exports = {
  workoutActionsRouter
};
