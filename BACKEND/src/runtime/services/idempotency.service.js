const { badRequest } = require('../../shared/errors');

function requireIdempotencyKey(headers) {
  const idempotencyKey = headers['idempotency-key'] || headers['x-idempotency-key'];

  if (!idempotencyKey || !String(idempotencyKey).trim()) {
    throw badRequest('Missing Idempotency-Key header');
  }

  return String(idempotencyKey).trim();
}

module.exports = {
  requireIdempotencyKey
};
