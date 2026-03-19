function normalizeMessage(message) {
  if (!message || !message.role || !message.content) {
    return null;
  }

  if (Array.isArray(message.content) && message.content.length === 0) {
    return null;
  }

  if (typeof message.content === 'string' && !message.content.trim()) {
    return null;
  }

  return message;
}

function applyHygiene(messages, policy = {}) {
  const maxMessages = policy.maxMessages || messages.length;

  return messages
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-maxMessages);
}

module.exports = {
  applyHygiene
};
