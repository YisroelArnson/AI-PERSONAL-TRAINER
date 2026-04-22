/**
 * File overview:
 * Contains automated tests for the output normalization adapter behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  buildToolResultMessage,
  normalizeAnthropicOutput,
  normalizeVisibleText
} = require('../../src/runtime/agent-runtime/output-normalization.adapter');

describe('output-normalization.adapter', () => {
  it('normalizes anthropic tool calls without requiring display-phase parsing', () => {
    const normalized = normalizeAnthropicOutput({
      outputText: '',
      stopReason: 'tool_use',
      usage: {},
      rawMessage: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'workout_history_fetch',
            input: {
              range: 'last_30_days'
            }
          }
        ]
      }
    });

    expect(normalized.toolCalls).toEqual([
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'workout_history_fetch',
        input: {
          range: 'last_30_days'
        }
      }
    ]);
    expect(normalized.rawText).toBe('');
    expect(normalized.assistantMessage).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'workout_history_fetch',
          input: {
            range: 'last_30_days'
          }
        }
      ]
    });
  });

  it('preserves raw assistant text so the runtime can reject plain-text leakage', () => {
    const normalized = normalizeAnthropicOutput({
      outputText: '',
      stopReason: 'tool_use',
      usage: {},
      rawMessage: {
        content: [
          {
            type: 'text',
            text: 'I am checking that now.'
          },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'memory_search',
            input: {
              query: 'recent squat pain'
            }
          }
        ]
      }
    });

    expect(normalized.rawText).toBe('I am checking that now.');
    expect(normalized.toolCalls).toHaveLength(1);
  });

  it('builds tool_result messages for anthropic follow-up turns', () => {
    expect(buildToolResultMessage(
      {
        id: 'tool-123'
      },
      {
        status: 'ok',
        output: {
          saved: true
        }
      }
    )).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolUseId: 'tool-123',
          content: JSON.stringify({
            output: {
              saved: true
            },
            status: 'ok'
          })
        }
      ]
    });
  });

  it('normalizes visible text consistently', () => {
    expect(normalizeVisibleText('Hello   \n\n\nworld\n')).toBe('Hello\n\nworld');
  });
});
