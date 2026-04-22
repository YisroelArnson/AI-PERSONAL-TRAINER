/**
 * File overview:
 * Supports the agent runtime flow for provider registry.
 *
 * Main functions in this file:
 * - getProviderAdapter: Gets Provider adapter needed by this file.
 */

const anthropicAdapter = require('./adapters/anthropic.adapter');
const xaiAdapter = require('./adapters/xai.adapter');
const { getProviderCapabilities } = require('./provider-capabilities');

const ADAPTERS = {
  anthropic: anthropicAdapter,
  xai: xaiAdapter
};

/**
 * Gets Provider adapter needed by this file.
 */
function getProviderAdapter(provider) {
  const adapter = ADAPTERS[provider];

  if (!adapter) {
    throw new Error(`Unsupported provider adapter: ${provider}`);
  }

  return adapter;
}

module.exports = {
  getProviderAdapter,
  getProviderCapabilities
};
