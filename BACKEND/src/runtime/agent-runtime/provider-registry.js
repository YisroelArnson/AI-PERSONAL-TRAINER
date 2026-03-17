const anthropicAdapter = require('./adapters/anthropic.adapter');
const { getProviderCapabilities } = require('./provider-capabilities');

const ADAPTERS = {
  anthropic: anthropicAdapter
};

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
