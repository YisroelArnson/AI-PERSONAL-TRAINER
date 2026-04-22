/**
 * File overview:
 * Contains automated tests for the xai adapter behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  accumulateToolResultState,
  buildRequest,
  normalizeOutput
} = require('../../src/runtime/agent-runtime/adapters/xai.adapter');

describe('xai.adapter', () => {
  it('builds an initial responses request with local prompt state, tools, and prompt caching', () => {
    const request = buildRequest({
      model: 'grok-4.20-reasoning',
      userId: 'user-123',
      systemPrompt: 'You are a coach.',
      messages: [
        {
          role: 'user',
          content: 'Build my next workout.'
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '<final>Here is the plan.</final>'
            }
          ]
        }
      ],
      tools: [
        {
          type: 'function',
          name: 'workout_generate',
          description: 'Generate the next workout.',
          parameters: {
            type: 'object'
          }
        }
      ],
      toolChoice: 'auto',
      parallelToolCalls: false,
      maxOutputTokens: 1500,
      promptCacheKey: 'session:abc123'
    });

    expect(request).toEqual({
      model: 'grok-4.20-reasoning',
      input: [
        {
          type: 'message',
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are a coach.'
            }
          ]
        },
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Build my next workout.'
            }
          ]
        },
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '<final>Here is the plan.</final>'
            }
          ]
        }
      ],
      max_output_tokens: 1500,
      parallel_tool_calls: false,
      tools: [
        {
          type: 'function',
          name: 'workout_generate',
          description: 'Generate the next workout.',
          parameters: {
            type: 'object'
          }
        }
      ],
      tool_choice: 'auto',
      prompt_cache_key: 'session:abc123'
    });
  });

  it('builds a continuation request from previous_response_id and pending function_call_output items', () => {
    const request = buildRequest({
      model: 'grok-4.20-reasoning',
      userId: 'user-123',
      tools: [],
      maxOutputTokens: 800,
      parallelToolCalls: false,
      providerState: {
        previousResponseId: 'resp_123',
        pendingInputItems: [
          {
            type: 'function_call_output',
            call_id: 'call_123',
            output: '{"status":"ok"}'
          }
        ]
      }
    });

    expect(request).toEqual({
      model: 'grok-4.20-reasoning',
      previous_response_id: 'resp_123',
      input: [
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '{"status":"ok"}'
        }
      ],
      max_output_tokens: 800,
      parallel_tool_calls: false
    });
  });

  it('preserves raw text-only responses so the runtime can reject them', () => {
    const normalized = normalizeOutput({
      responseId: 'resp_text_123',
      outputText: '',
      stopReason: 'completed',
      usage: {
        input_tokens: 100,
        output_tokens: 25
      },
      rawMessage: {
        id: 'resp_text_123',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '<commentary>Thinking.</commentary><final>Done.</final>'
              }
            ]
          }
        ]
      }
    });

    expect(normalized.rawText).toBe('<commentary>Thinking.</commentary><final>Done.</final>');
    expect(normalized.toolCalls).toEqual([]);
    expect(normalized.assistantMessage).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '<commentary>Thinking.</commentary><final>Done.</final>'
        }
      ]
    });
    expect(normalized.providerState).toEqual({
      previousResponseId: 'resp_text_123'
    });
  });

  it('normalizes function calls and accumulates function_call_output continuation state', () => {
    const normalized = normalizeOutput({
      responseId: 'resp_tool_123',
      outputText: '',
      stopReason: 'completed',
      usage: {},
      rawMessage: {
        id: 'resp_tool_123',
        output: [
          {
            type: 'function_call',
            id: 'fc_123',
            call_id: 'call_123',
            name: 'workout_generate',
            arguments: '{"goal":"strength"}'
          }
        ]
      }
    });

    expect(normalized.toolCalls).toEqual([
      {
        type: 'tool_use',
        id: 'call_123',
        name: 'workout_generate',
        input: {
          goal: 'strength'
        }
      }
    ]);
    expect(normalized.rawText).toBe('');

    const nextState = accumulateToolResultState({
      currentState: normalized.providerState,
      finalOutput: {
        responseId: 'resp_tool_123'
      },
      toolCall: normalized.toolCalls[0],
      toolResult: {
        status: 'ok',
        output: {
          workoutId: 'workout-123'
        }
      }
    });

    expect(nextState).toEqual({
      previousResponseId: 'resp_tool_123',
      pendingInputItems: [
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: JSON.stringify({
            status: 'ok',
            output: {
              workoutId: 'workout-123'
            }
          })
        }
      ]
    });
  });
});
