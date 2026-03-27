const {
  createDisplayPhaseParser,
  extractDisplayText,
  normalizeAnthropicOutput
} = require('../../src/runtime/agent-runtime/output-normalization.adapter');

describe('output-normalization.adapter', () => {
  it('extracts commentary steps and final text from tagged output', () => {
    const extracted = extractDisplayText([
      '<commentary>',
      '<step>Checking your current workout.</step>',
      '<step>Adjusting today for lower impact.</step>',
      '</commentary>',
      '<final>Here is your updated plan.</final>'
    ].join(''));

    expect(extracted.commentaryText).toBe([
      '• Checking your current workout.',
      '• Adjusting today for lower impact.'
    ].join('\n'));
    expect(extracted.finalText).toBe('Here is your updated plan.');
  });

  it('supports split commentary tags during streaming', () => {
    const parser = createDisplayPhaseParser();

    expect(parser.consume('<comment')).toEqual([]);

    expect(parser.consume('ary><step>Checking')).toEqual([
      {
        kind: 'delta',
        phase: 'commentary',
        text: '• Checking'
      }
    ]);

    expect(parser.consume(' your recent history.</step></commentary>')).toEqual([
      {
        kind: 'delta',
        phase: 'commentary',
        text: ' your recent history.'
      },
      {
        kind: 'completed',
        phase: 'commentary',
        text: '• Checking your recent history.'
      }
    ]);

    expect(parser.consume('<final>Adjusted plan')).toEqual([
      {
        kind: 'delta',
        phase: 'final',
        text: 'Adjusted plan'
      }
    ]);

    expect(parser.flush()).toEqual([
      {
        kind: 'completed',
        phase: 'final',
        text: 'Adjusted plan'
      }
    ]);
  });

  it('does not persist commentary as the final reply when tool calls are present', () => {
    const normalized = normalizeAnthropicOutput({
      outputText: '',
      stopReason: 'tool_use',
      usage: {},
      rawMessage: {
        content: [
          {
            type: 'text',
            text: '<commentary><step>Checking your recent training.</step></commentary>'
          },
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

    expect(normalized.commentaryText).toBe('• Checking your recent training.');
    expect(normalized.finalText).toBe('');
    expect(normalized.outputText).toBe('');
    expect(normalized.toolCalls).toHaveLength(1);
  });
});
