const anthropicAdapter = require('./adapters/anthropic.adapter');
const xaiAdapter = require('./adapters/xai.adapter');
const { getProviderCapabilities } = require('./provider-capabilities');

const ADAPTERS = {
  anthropic: anthropicAdapter,
  xai: xaiAdapter
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
