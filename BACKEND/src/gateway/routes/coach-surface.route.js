const express = require('express');

const { authenticateUser } = require('../middleware/authenticate-user');
const { getCoachSurface } = require('../services/coach-surface.service');

const coachSurfaceRouter = express.Router();

coachSurfaceRouter.get('/', authenticateUser, async (req, res, next) => {
  try {
    const surface = await getCoachSurface({
      auth: req.auth,
      query: req.query,
      requestId: req.requestId
    });

    res.status(200).json(surface);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  coachSurfaceRouter
};
