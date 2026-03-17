const PROVIDER_CAPABILITIES = {
  anthropic: {
    'claude-sonnet-4-6': {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      supportsTools: true,
      supportsParallelTools: false,
      supportsReasoningTokens: false,
      maxContextTokens: 200000,
      streamProtocol: 'anthropic_messages'
    },
    'claude-opus-4-6': {
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      supportsTools: true,
      supportsParallelTools: false,
      supportsReasoningTokens: false,
      maxContextTokens: 200000,
      streamProtocol: 'anthropic_messages'
    },
    'claude-haiku-4-5-20251001': {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      supportsTools: true,
      supportsParallelTools: false,
      supportsReasoningTokens: false,
      maxContextTokens: 200000,
      streamProtocol: 'anthropic_messages'
    },
    'claude-3-haiku-20240307': {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      supportsTools: true,
      supportsParallelTools: false,
      supportsReasoningTokens: false,
      maxContextTokens: 200000,
      streamProtocol: 'anthropic_messages'
    }
  }
};

function getProviderCapabilities(provider, model) {
  const providerModels = PROVIDER_CAPABILITIES[provider] || {};
  const caps = providerModels[model];

  if (!caps) {
    throw new Error(`Unsupported provider/model combination: ${provider}/${model}`);
  }

  return caps;
}

module.exports = {
  getProviderCapabilities
};
