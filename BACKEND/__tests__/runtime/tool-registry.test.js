const { listToolDefinitions } = require('../../src/runtime/trainer-tools/tool-registry');

describe('tool-registry', () => {
  it('registers the coach soul tools', () => {
    const toolNames = listToolDefinitions().map(definition => definition.name);

    expect(toolNames).toContain('coach_soul_get');
    expect(toolNames).toContain('coach_soul_replace_entire');
  });
});
