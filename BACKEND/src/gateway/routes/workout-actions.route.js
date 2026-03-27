const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const {
  parseCompleteCurrentSetRequest,
  parseSkipCurrentExerciseRequest,
  parseWorkoutSessionControlRequest
} = require('../schemas/workout-actions.schema');
const { badRequest } = require('../../shared/errors');
const {
  processCompleteCurrentSetAction,
  processFinishWorkoutAction,
  processPauseWorkoutAction,
  processResumeWorkoutAction,
  processSkipCurrentExerciseAction,
  processStartWorkoutAction
} = require('../services/workout-actions.service');

const workoutActionsRouter = express.Router();

workoutActionsRouter.post('/start-workout', authenticateUser, async (req, res, next) => {
  try {
    const body = parseWorkoutSessionControlRequest(req.body);
    const result = await processStartWorkoutAction({
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

workoutActionsRouter.post('/skip-current-exercise', authenticateUser, async (req, res, next) => {
  try {
    const body = parseSkipCurrentExerciseRequest(req.body);
    const result = await processSkipCurrentExerciseAction({
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

workoutActionsRouter.post('/pause-workout', authenticateUser, async (req, res, next) => {
  try {
    const body = parseWorkoutSessionControlRequest(req.body);
    const result = await processPauseWorkoutAction({
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

workoutActionsRouter.post('/resume-workout', authenticateUser, async (req, res, next) => {
  try {
    const body = parseWorkoutSessionControlRequest(req.body);
    const result = await processResumeWorkoutAction({
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

workoutActionsRouter.post('/finish-workout', authenticateUser, async (req, res, next) => {
  try {
    const body = parseWorkoutSessionControlRequest(req.body);
    const result = await processFinishWorkoutAction({
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
