const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { parseSessionResetRequest } = require('../schemas/session-reset.schema');
const { badRequest } = require('../../shared/errors');
const { processSessionReset } = require('../services/session-reset.service');

const sessionsRouter = express.Router();

sessionsRouter.post('/reset', authenticateUser, async (req, res, next) => {
  try {
    const body = parseSessionResetRequest(req.body);
    const resetResult = await processSessionReset({
      auth: req.auth,
      headers: req.headers,
      body
    });

    res.status(200).json(resetResult);
  } catch (error) {
    if (error && error.name === 'ZodError') {
      return next(badRequest('Invalid request body', error.flatten()));
    }

    return next(error);
  }
});

module.exports = {
  sessionsRouter
};
