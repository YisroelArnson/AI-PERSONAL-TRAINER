const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { parseMessageRequest } = require('../schemas/message.schema');
const { badRequest } = require('../../shared/errors');
const { processInboundMessage } = require('../services/message-ingress.service');

const messagesRouter = express.Router();

messagesRouter.post('/', authenticateUser, async (req, res, next) => {
  try {
    const body = parseMessageRequest(req.body);
    const accepted = await processInboundMessage({
      auth: req.auth,
      headers: req.headers,
      body
    });

    res.status(202).json(accepted);
  } catch (error) {
    if (error && error.name === 'ZodError') {
      return next(badRequest('Invalid request body', error.flatten()));
    }

    return next(error);
  }
});

module.exports = {
  messagesRouter
};
