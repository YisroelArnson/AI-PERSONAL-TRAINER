/**
 * File overview:
 * Defines the runs HTTP route wiring for the gateway layer.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { buildRunResultView, buildRunStatusView } = require('../services/run-read.service');
const { streamRunEvents } = require('../services/run-stream.service');

const runsRouter = express.Router();

runsRouter.get('/:runId', authenticateUser, async (req, res, next) => {
  try {
    const payload = await buildRunStatusView({
      runId: req.params.runId,
      userId: req.auth.userId
    });

    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

runsRouter.get('/:runId/result', authenticateUser, async (req, res, next) => {
  try {
    const result = await buildRunResultView({
      runId: req.params.runId,
      userId: req.auth.userId
    });

    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    next(error);
  }
});

runsRouter.get('/:runId/stream', authenticateUser, async (req, res, next) => {
  try {
    await streamRunEvents({
      auth: req.auth,
      req,
      res,
      params: req.params
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  runsRouter
};
