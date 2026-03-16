const { HttpError, notFound } = require('../../shared/errors');

function notFoundHandler(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
      requestId: req.requestId
    });
    return;
  }

  console.error('Unhandled gateway error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred.',
    requestId: req.requestId
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
