/**
 * File overview:
 * Supports the agent runtime flow for types.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const NORMALIZED_STREAM_EVENT_TYPES = {
  messageStart: 'message_start',
  textDelta: 'text_delta',
  toolUseStart: 'tool_use_start',
  toolInputDelta: 'tool_input_delta',
  messageDelta: 'message_delta',
  messageStop: 'message_stop'
};

const ERROR_CLASSES = {
  authError: 'auth_error',
  invalidRequest: 'invalid_request',
  providerInternal: 'provider_internal',
  providerUnavailable: 'provider_unavailable',
  rateLimited: 'rate_limited',
  retryableNetwork: 'retryable_network',
  unknown: 'unknown'
};

module.exports = {
  NORMALIZED_STREAM_EVENT_TYPES,
  ERROR_CLASSES
};
