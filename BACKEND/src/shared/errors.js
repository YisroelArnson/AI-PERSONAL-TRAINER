/**
 * File overview:
 * Provides shared helpers for errors.
 *
 * Main functions in this file:
 * - badRequest: Handles Bad request for errors.js.
 * - conflict: Handles Conflict for errors.js.
 * - tooManyRequests: Handles Too many requests for errors.js.
 * - unauthorized: Handles Unauthorized for errors.js.
 * - notFound: Handles Not found for errors.js.
 */

class HttpError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Handles Bad request for errors.js.
 */
function badRequest(message, details) {
  return new HttpError(400, 'bad_request', message, details);
}

/**
 * Handles Conflict for errors.js.
 */
function conflict(message, details) {
  return new HttpError(409, 'conflict', message, details);
}

/**
 * Handles Too many requests for errors.js.
 */
function tooManyRequests(message = 'Too many requests', details) {
  return new HttpError(429, 'too_many_requests', message, details);
}

/**
 * Handles Unauthorized for errors.js.
 */
function unauthorized(message = 'Authentication required') {
  return new HttpError(401, 'unauthorized', message);
}

/**
 * Handles Not found for errors.js.
 */
function notFound(message = 'Route not found') {
  return new HttpError(404, 'not_found', message);
}

module.exports = {
  HttpError,
  badRequest,
  conflict,
  tooManyRequests,
  unauthorized,
  notFound
};
