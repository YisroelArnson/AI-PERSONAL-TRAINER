function toAnthropicTool(tool, options = {}) {
  const anthropicTool = {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  };

  if (options.cacheControl) {
    anthropicTool.cache_control = options.cacheControl;
  }

  return anthropicTool;
}

function toXaiTool(tool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  };
}

function buildCacheControl(ttl) {
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

function toProviderTools(tools, caps, options = {}) {
  if (!tools || tools.length === 0) {
    return [];
  }

  if (!caps.supportsTools) {
    return [];
  }

  if (caps.provider === 'xai') {
    return tools.map(toXaiTool);
  }

  const anthropicTools = tools.map((tool, index) => {
    const shouldMarkCacheBreakpoint =
      options.enablePromptCaching &&
      index === tools.length - 1;

    return toAnthropicTool(tool, {
      cacheControl: shouldMarkCacheBreakpoint
        ? buildCacheControl(options.staticCacheTtl)
        : null
    });
  });

  return anthropicTools;
}

module.exports = {
  toProviderTools
};
