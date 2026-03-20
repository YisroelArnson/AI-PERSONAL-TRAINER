const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { streamRunEvents } = require('../services/run-stream.service');

const runsRouter = express.Router();

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
