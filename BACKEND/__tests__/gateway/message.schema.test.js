const { parseMessageRequest } = require('../../src/gateway/schemas/message.schema');

describe('parseMessageRequest', () => {
  it('accepts ui.action.complete_set as a compatibility trigger', () => {
    const parsed = parseMessageRequest({
      message: 'I finished the current set.',
      sessionKey: 'user:123:main',
      triggerType: 'ui.action.complete_set',
      metadata: {
        source: 'ios_card_action',
        actionId: 'complete_set'
      }
    });

    expect(parsed.triggerType).toBe('ui.action.complete_set');
  });
});
