const {
  getPromptLayerPath,
  loadStaticPromptLayer,
  normalizeMarkdown
} = require('../../src/runtime/services/static-prompt-layers.service');

describe('static-prompt-layers.service', () => {
  it('normalizes line endings and trims surrounding whitespace', () => {
    expect(normalizeMarkdown('\r\nHello\r\n\r\n')).toBe('Hello');
  });

  it('loads a runtime prompt layer from disk', async () => {
    const markdown = await loadStaticPromptLayer('system-prompt.md');

    expect(markdown).toContain('### Mission');
    expect(getPromptLayerPath('system-prompt.md')).toContain('prompt-layers');
  });

  it('falls back when a prompt layer file is missing', async () => {
    const markdown = await loadStaticPromptLayer('missing-layer.md', 'fallback text');

    expect(markdown).toBe('fallback text');
  });
});
