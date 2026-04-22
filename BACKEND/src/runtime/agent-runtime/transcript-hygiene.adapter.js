
/**
 * Normalizes Message into the format this file expects.
 */
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

/**
 * Trims Trailing assistant messages to the supported shape.
 */
function trimTrailingAssistantMessages(messages, policy = {}) {
  if (policy.provider !== 'anthropic') {
    return messages;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return messages.slice(0, index + 1);
    }
  }

  return messages;
}

/**
 * Applies Hygiene to the current data.
 */
function applyHygiene(messages, policy = {}) {
  const maxMessages = policy.maxMessages || messages.length;

  const normalized = messages
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-maxMessages);

  return trimTrailingAssistantMessages(normalized, policy);
}

module.exports = {
  applyHygiene
};
