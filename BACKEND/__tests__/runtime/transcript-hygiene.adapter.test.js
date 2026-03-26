const { applyHygiene } = require('../../src/runtime/agent-runtime/transcript-hygiene.adapter');

describe('applyHygiene', () => {
  it('trims trailing assistant messages for anthropic requests', () => {
    const hydrated = applyHygiene([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'First'
          }
        ]
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Reply'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Latest user turn'
          }
        ]
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Leaked later assistant turn'
          }
        ]
      }
    ], {
      provider: 'anthropic',
      maxMessages: 10
    });

    expect(hydrated).toEqual([
      expect.objectContaining({ role: 'user' }),
      expect.objectContaining({ role: 'assistant' }),
      expect.objectContaining({ role: 'user' })
    ]);
    expect(hydrated.at(-1)).toEqual(expect.objectContaining({
      role: 'user'
    }));
  });

  it('preserves trailing assistant messages for non-anthropic providers', () => {
    const hydrated = applyHygiene([
      {
        role: 'user',
        content: 'First'
      },
      {
        role: 'assistant',
        content: 'Reply'
      }
    ], {
      provider: 'openai',
      maxMessages: 10
    });

    expect(hydrated.at(-1)).toEqual(expect.objectContaining({
      role: 'assistant'
    }));
  });
});
