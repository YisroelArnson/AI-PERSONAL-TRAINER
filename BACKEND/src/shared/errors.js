class HttpError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new HttpError(400, 'bad_request', message, details);
}

function conflict(message, details) {
  return new HttpError(409, 'conflict', message, details);
}

function unauthorized(message = 'Authentication required') {
  return new HttpError(401, 'unauthorized', message);
}

function notFound(message = 'Route not found') {
  return new HttpError(404, 'not_found', message);
}

module.exports = {
  HttpError,
  badRequest,
  conflict,
  unauthorized,
  notFound
};
