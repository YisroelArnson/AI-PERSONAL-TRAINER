const {
  shouldLoadBootstrapInstructions,
  buildVersionedDocumentMarkdown
} = require('../../src/runtime/agent-runtime/prompt-assembly');

describe('prompt-assembly bootstrap behavior', () => {
  it('loads bootstrap when the program document is missing', () => {
    expect(shouldLoadBootstrapInstructions(null)).toBe(true);
  });

  it('loads bootstrap when the program document is blank', () => {
    expect(shouldLoadBootstrapInstructions({
      version: {
        content: '   '
      }
    })).toBe(true);
  });

  it('does not load bootstrap when the program document has content', () => {
    expect(shouldLoadBootstrapInstructions({
      version: {
        content: '# PROGRAM.md\n\n## Summary\n- **Primary Goal**: Strength'
      }
    })).toBe(false);
  });

  it('includes current version metadata even when the document is blank', () => {
    expect(buildVersionedDocumentMarkdown({
      doc: {
        current_version: 1
      },
      version: {
        content: '   '
      }
    })).toBe('Current Version: 1\n_not available yet_');
  });
});
