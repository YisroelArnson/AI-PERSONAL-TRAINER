const {
  buildSessionExcerptMarkdown,
  buildSessionMemoryMarker,
  normalizeSessionMemoryMessageCount,
  shouldIncludeSessionMemoryEvent
} = require('../../src/runtime/services/session-memory-flush.service');

describe('session-memory-flush.service', () => {
  it('filters to visible user and assistant messages only', () => {
    expect(shouldIncludeSessionMemoryEvent({
      actor: 'user',
      event_type: 'user.message',
      payload: {
        message: 'Can you help me debug this?'
      }
    })).toBe(true);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'user',
      event_type: 'user.message',
      payload: {
        message: '/new'
      }
    })).toBe(false);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'assistant',
      event_type: 'assistant.message',
      payload: {
        text: 'Absolutely.'
      }
    })).toBe(true);

    expect(shouldIncludeSessionMemoryEvent({
      actor: 'assistant',
      event_type: 'assistant.message',
      payload: {
        text: 'hidden',
        metadata: {
          hiddenInFeed: true
        }
      }
    })).toBe(false);
  });

  it('formats a deterministic session excerpt block', () => {
    const markdown = buildSessionExcerptMarkdown({
      sessionKey: 'user:123:main',
      sessionId: 'abc123',
      endedAt: '2026-03-20T14:30:00.000Z',
      rotationReason: 'manual_reset',
      entries: [
        {
          role: 'user',
          text: 'Can you help me debug this?'
        },
        {
          role: 'assistant',
          text: 'Yes, what error are you seeing?'
        }
      ]
    });

    expect(markdown).toContain(buildSessionMemoryMarker('abc123'));
    expect(markdown).toContain('- **Session Key**: user:123:main');
    expect(markdown).toContain('- **Session ID**: abc123');
    expect(markdown).toContain('- **Rotation Reason**: manual_reset');
    expect(markdown).toContain('user: Can you help me debug this?');
    expect(markdown).toContain('assistant: Yes, what error are you seeing?');
  });

  it('normalizes invalid message counts to a safe floor', () => {
    expect(normalizeSessionMemoryMessageCount(0)).toBe(1);
    expect(normalizeSessionMemoryMessageCount('15')).toBe(15);
    expect(normalizeSessionMemoryMessageCount(undefined)).toBe(15);
  });
});
