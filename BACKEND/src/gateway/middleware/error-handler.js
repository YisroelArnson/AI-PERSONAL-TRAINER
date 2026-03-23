const { HttpError, notFound } = require('../../shared/errors');

function isMissingAuthUserForeignKeyError(err) {
  const details = String(err && err.details ? err.details : '');
  const message = String(err && err.message ? err.message : '');

  return (
    err &&
    err.code === '23503' &&
    details.includes('Key (user_id)=') &&
    details.includes('is not present in table "users"') &&
    (
      message.includes('session_state') ||
      message.includes('idempotency_keys') ||
      message.includes('runs') ||
      message.includes('session_events') ||
      message.includes('memory_docs')
    )
  );
}

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

  if (isMissingAuthUserForeignKeyError(err)) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authenticated user no longer exists. Sign in again.',
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
