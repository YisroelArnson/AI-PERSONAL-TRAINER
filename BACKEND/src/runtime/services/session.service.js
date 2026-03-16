const { randomUUID } = require('node:crypto');

function canonicalizeSessionKey(userId, providedSessionKey) {
  const raw = providedSessionKey || `user:${userId}:main`;
  return raw.trim().toLowerCase();
}

async function resolveSession({ userId, sessionKey }) {
  return {
    sessionKey: canonicalizeSessionKey(userId, sessionKey),
    sessionId: randomUUID(),
    mode: 'scaffold'
  };
}

module.exports = {
  canonicalizeSessionKey,
  resolveSession
};
