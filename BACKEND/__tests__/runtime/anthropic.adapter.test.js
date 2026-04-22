/**
 * File overview:
 * Contains automated tests for the anthropic adapter behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { buildRequest } = require('../../src/runtime/agent-runtime/adapters/anthropic.adapter');

describe('anthropic.adapter buildRequest', () => {
  it('preserves cache_control on message text blocks', () => {
    const request = buildRequest({
      model: 'claude-sonnet-4-6',
      maxOutputTokens: 4000,
      userId: 'user-123',
      systemPromptBlocks: [
        {
          type: 'text',
          text: 'system'
        }
      ],
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Cached assistant history',
              cache_control: {
                type: 'ephemeral',
                ttl: '5m'
              }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Current user turn'
            }
          ]
        }
      ]
    });

    expect(request.messages[0].content[0]).toEqual({
      type: 'text',
      text: 'Cached assistant history',
      cache_control: {
        type: 'ephemeral',
        ttl: '5m'
      }
    });
  });
});
