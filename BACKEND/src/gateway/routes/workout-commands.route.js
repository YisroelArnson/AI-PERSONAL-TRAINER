/**
 * File overview:
 * Defines the workout commands HTTP route wiring for the gateway layer.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { badRequest } = require('../../shared/errors');
const { parseWorkoutCommandRequest } = require('../schemas/workout-commands.schema');
const { processWorkoutCommand } = require('../services/workout-commands.service');

const workoutCommandsRouter = express.Router();

workoutCommandsRouter.post('/', authenticateUser, async (req, res, next) => {
  try {
    const body = parseWorkoutCommandRequest(req.body);
    const result = await processWorkoutCommand({
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
  workoutCommandsRouter
};
