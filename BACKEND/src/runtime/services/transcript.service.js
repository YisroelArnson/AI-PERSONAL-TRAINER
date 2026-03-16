const { randomUUID } = require('node:crypto');

async function appendInboundEvent({ userId, sessionKey, sessionId, triggerType, message, metadata, idempotencyKey }) {
  return {
    eventId: randomUUID(),
    userId,
    sessionKey,
    sessionId,
    triggerType,
    actor: 'user',
    payload: {
      message,
      metadata: metadata || {}
    },
    idempotencyKey,
    mode: 'scaffold'
  };
}

module.exports = {
  appendInboundEvent
};
