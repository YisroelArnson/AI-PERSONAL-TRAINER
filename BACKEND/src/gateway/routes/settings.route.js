/**
 * File overview:
 * Defines the settings HTTP route wiring for the gateway layer.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { badRequest } = require('../../shared/errors');
const { parseUpdateLlmSettingsRequest } = require('../schemas/settings.schema');
const { getLlmSettings, updateLlmSettings } = require('../services/settings-llm.service');

const settingsRouter = express.Router();

settingsRouter.get('/llm', authenticateUser, async (req, res, next) => {
  try {
    const result = await getLlmSettings({
      auth: req.auth
    });

    res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

settingsRouter.put('/llm', authenticateUser, async (req, res, next) => {
  try {
    const body = parseUpdateLlmSettingsRequest(req.body);
    const result = await updateLlmSettings({
      auth: req.auth,
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
  settingsRouter
};
