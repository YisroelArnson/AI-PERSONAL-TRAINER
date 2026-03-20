const { hashRequestPayload } = require('../../shared/hash');
const { requireIdempotencyKey } = require('../../runtime/services/idempotency.service');
const { resetSessionHead } = require('../../runtime/services/manual-session-reset.service');

async function processSessionReset({ auth, headers, body }) {
  const idempotencyKey = requireIdempotencyKey(headers);
  const requestHash = hashRequestPayload(body);
  const resetResult = await resetSessionHead({
    userId: auth.userId,
    route: '/v1/sessions/reset',
    idempotencyKey,
    requestHash,
    sessionKey: body.sessionKey
  });

  return {
    ...resetResult,
    debug: {
      idempotencyKey,
      requestHash,
      implementationMode: resetResult.replayed ? 'db-rpc-replayed' : 'db-rpc'
    }
  };
}

module.exports = {
  processSessionReset
};
