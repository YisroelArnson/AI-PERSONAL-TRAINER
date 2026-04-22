/**
 * File overview:
 * Contains automated tests for the run agent turn behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const mockAppendStreamEvent = jest.fn().mockResolvedValue();
const mockExecuteToolCall = jest.fn();
const mockResolveToolCallBehavior = jest.fn();
const mockBuildRequest = jest.fn(input => input);
const mockCreateStream = jest.fn(() => ({
  on: jest.fn(),
  [Symbol.asyncIterator]: async function* () {}
}));
const mockNormalizeStreamEvent = jest.fn(() => null);
const mockAppendRawLlmPayload = jest.fn().mockResolvedValue(null);
const mockExtractFinalOutput = jest.fn();
const mockNormalizeOutput = jest.fn();
const mockBuildToolResultMessage = jest.fn();
const mockAccumulateToolResultState = jest.fn(() => null);
const mockResolveEffectiveLlmSelectionForRun = jest.fn(() => ({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6'
}));

jest.mock('../../src/config/env', () => ({
  env: {
    defaultLlmProvider: 'anthropic',
    defaultAnthropicModel: 'claude-sonnet-4-6',
    defaultXaiModel: 'grok-4.20-reasoning',
    agentMaxIterations: 3,
    agentMaxOutputTokens: 4000,
    agentPromptMessageLimit: 12,
    llmRawIoLoggingEnabled: false,
    anthropicPromptCachingEnabled: false,
    anthropicConversationCacheTtl: '5m',
    anthropicStaticCacheTtl: '5m',
    xaiPromptCachingEnabled: false,
    verboseLlmStreamEventsEnabled: false
  }
}));

jest.mock('../../src/runtime/services/stream-events.service', () => ({
  appendStreamEvent: mockAppendStreamEvent,
  publishHotStreamEvent: mockAppendStreamEvent
}));

jest.mock('../../src/runtime/services/raw-llm-io-log.service', () => ({
  appendRawLlmPayload: mockAppendRawLlmPayload
}));

jest.mock('../../src/runtime/agent-runtime/provider-registry', () => ({
  getProviderAdapter: jest.fn(() => ({
    validateCapabilities: jest.fn(),
    buildRequest: mockBuildRequest,
    createStream: mockCreateStream,
    normalizeStreamEvent: mockNormalizeStreamEvent,
    extractFinalOutput: mockExtractFinalOutput,
    normalizeOutput: mockNormalizeOutput,
    buildToolResultMessage: mockBuildToolResultMessage,
    accumulateToolResultState: mockAccumulateToolResultState,
    classifyError: jest.fn(() => 'unknown')
  })),
  getProviderCapabilities: jest.fn(() => ({
    supportsTools: true,
    model: 'claude-sonnet-4-6'
  }))
}));

jest.mock('../../src/runtime/agent-runtime/transcript-hygiene.adapter', () => ({
  applyHygiene: jest.fn(messages => messages)
}));

jest.mock('../../src/runtime/agent-runtime/tool-schema.adapter', () => ({
  toProviderTools: jest.fn(() => [
    {
      name: 'document_replace_entire',
      description: 'Replace the full contents of PROGRAM.',
      input_schema: {}
    }
  ])
}));

jest.mock('../../src/runtime/agent-runtime/output-normalization.adapter', () => ({
  normalizeVisibleText: jest.fn(value => String(value || '').trim())
}));

jest.mock('../../src/runtime/services/llm-config.service', () => ({
  resolveEffectiveLlmSelectionForRun: mockResolveEffectiveLlmSelectionForRun
}));

jest.mock('../../src/runtime/agent-runtime/prompt-assembly', () => ({
  assemblePrompt: jest.fn(async () => ({
    systemPrompt: 'system',
    systemBlocks: 'system',
    messages: [
      {
        role: 'user',
        content: 'Build my first program.'
      }
    ],
    metadata: {
      cacheHit: false,
      sourceEventIds: [],
      layers: {}
    }
  }))
}));

jest.mock('../../src/runtime/trainer-tools/tool-registry', () => ({
  listToolDefinitions: jest.fn(() => [
    {
      name: 'document_replace_entire',
      description: 'Replace the full contents of PROGRAM.',
      inputSchema: {}
    },
    {
      name: 'message_notify_user',
      description: 'Send a user-facing message.',
      inputSchema: {}
    },
    {
      name: 'idle',
      description: 'Terminate the run.',
      inputSchema: {}
    }
  ]),
  resolveToolCallBehavior: mockResolveToolCallBehavior,
  executeToolCall: mockExecuteToolCall
}));

const { runAgentTurn } = require('../../src/runtime/agent-runtime/run-agent-turn');
const { env } = require('../../src/config/env');

describe('run-agent-turn tool-only runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.llmRawIoLoggingEnabled = false;
    env.anthropicPromptCachingEnabled = false;
    env.xaiPromptCachingEnabled = false;
    mockNormalizeStreamEvent.mockReset();
    mockNormalizeStreamEvent.mockReturnValue(null);
    mockCreateStream.mockImplementation(() => ({
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {}
    }));
    mockBuildToolResultMessage.mockImplementation((toolCall, toolResult) => ({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolUseId: toolCall.id,
          content: JSON.stringify(toolResult)
        }
      ]
    }));
    mockResolveToolCallBehavior.mockImplementation(({ toolName, input }) => ({
      exists: true,
      mutating: toolName !== 'idle',
      terminal: toolName === 'idle'
        || toolName === 'message_ask_user'
        || (toolName === 'message_notify_user' && String(input && input.delivery || 'feed') !== 'transient')
    }));
  });

  it('retries instead of executing a tool call that was truncated by max_tokens', async () => {
    mockExtractFinalOutput
      .mockResolvedValueOnce({
        stopReason: 'max_tokens',
        usage: {},
        rawMessage: {}
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      });

    mockNormalizeOutput
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'document_replace_entire',
            input: {
              doc_key: 'PROGRAM',
              expected_version: 0
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'max_tokens',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-2',
            name: 'message_notify_user',
            input: {
              text: 'Saved cleanly.',
              delivery: 'feed'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'message_notify_user',
              input: {
                text: 'Saved cleanly.',
                delivery: 'feed'
              }
            }
          ]
        },
        stopReason: 'end_turn',
        usage: {}
      });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        text: 'Saved cleanly.',
        delivery: 'feed'
      }
    });

    const result = await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(result.outputText).toBe('Saved cleanly.');
    expect(mockExecuteToolCall).toHaveBeenCalledTimes(1);
    expect(mockBuildRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      maxOutputTokens: 4000
    }));

    const secondRequestMessages = mockBuildRequest.mock.calls[1][0].messages;
    expect(secondRequestMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('cut off by the output token limit')
      })
    ]));

    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'tool.call.skipped',
      payload: expect.objectContaining({
        reason: 'provider_max_tokens'
      })
    }));
  });

  it('records request failures when stream creation throws synchronously', async () => {
    mockCreateStream.mockImplementationOnce(() => {
      throw new Error('prefill invalid');
    });

    await expect(runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    })).rejects.toThrow('prefill invalid');

    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'llm.request.failed',
      payload: expect.objectContaining({
        message: 'prefill invalid'
      })
    }));
  });

  it('streams a tool call immediately and publishes assistant text before tool execution completes', async () => {
    mockCreateStream.mockImplementationOnce(() => ({
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'provider.tool.start' };
        yield { type: 'provider.tool.delta' };
      }
    }));

    mockNormalizeStreamEvent.mockImplementation(providerEvent => {
      if (providerEvent.type === 'provider.tool.start') {
        return {
          type: 'tool_use_start',
          payload: {
            streamKey: 'tool:1',
            toolUseId: 'notify-early',
            toolName: 'message_notify_user',
            input: {}
          }
        };
      }

      if (providerEvent.type === 'provider.tool.delta') {
        return {
          type: 'tool_input_delta',
          payload: {
            streamKey: 'tool:1',
            partialJson: '{"text":"Working through your plan now.","delivery":"feed"}'
          }
        };
      }

      return null;
    });

    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeOutput.mockReturnValue({
      toolCalls: [
        {
          id: 'notify-early',
          name: 'message_notify_user',
          input: {
            text: 'Working through your plan now.',
            delivery: 'feed'
          }
        }
      ],
      rawText: '',
      assistantMessage: {
        role: 'assistant',
        content: []
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        text: 'Working through your plan now.',
        delivery: 'feed'
      }
    });

    const result = await runAgentTurn({
      run_id: 'run-streamed-tool',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(result.outputText).toBe('Working through your plan now.');

    const streamEvents = mockAppendStreamEvent.mock.calls.map(([event]) => event);
    const requestedEvents = streamEvents.filter(event => event.eventType === 'tool.call.requested');
    const assistantDeltaEvent = streamEvents.find(event => event.eventType === 'assistant.delta');
    const completedEvent = streamEvents.find(event => event.eventType === 'tool.call.completed');

    expect(requestedEvents).toHaveLength(1);
    expect(requestedEvents[0]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        iteration: 1,
        toolName: 'message_notify_user',
        toolUseId: 'notify-early'
      })
    }));
    expect(assistantDeltaEvent).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        iteration: 1,
        toolName: 'message_notify_user',
        toolUseId: 'notify-early',
        text: 'Working through your plan now.',
        delivery: 'feed'
      })
    }));
    expect(streamEvents.indexOf(assistantDeltaEvent)).toBeLessThan(streamEvents.indexOf(completedEvent));
  });

  it('batches streamed assistant text into five-word chunks and flushes the remainder before execution', async () => {
    mockCreateStream.mockImplementationOnce(() => ({
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'provider.tool.start' };
        yield { type: 'provider.tool.delta' };
      }
    }));

    mockNormalizeStreamEvent.mockImplementation(providerEvent => {
      if (providerEvent.type === 'provider.tool.start') {
        return {
          type: 'tool_use_start',
          payload: {
            streamKey: 'tool:2',
            toolUseId: 'notify-batched',
            toolName: 'message_notify_user',
            input: {}
          }
        };
      }

      if (providerEvent.type === 'provider.tool.delta') {
        return {
          type: 'tool_input_delta',
          payload: {
            streamKey: 'tool:2',
            partialJson: '{"text":"One two three four five six seven.","delivery":"feed"}'
          }
        };
      }

      return null;
    });

    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeOutput.mockReturnValue({
      toolCalls: [
        {
          id: 'notify-batched',
          name: 'message_notify_user',
          input: {
            text: 'One two three four five six seven.',
            delivery: 'feed'
          }
        }
      ],
      rawText: '',
      assistantMessage: {
        role: 'assistant',
        content: []
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        text: 'One two three four five six seven.',
        delivery: 'feed'
      }
    });

    await runAgentTurn({
      run_id: 'run-batched-tool',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    const streamEvents = mockAppendStreamEvent.mock.calls.map(([event]) => event);
    const assistantDeltaEvents = streamEvents.filter(event => event.eventType === 'assistant.delta');
    const completedEvent = streamEvents.find(event => event.eventType === 'tool.call.completed');

    expect(assistantDeltaEvents).toHaveLength(2);
    expect(assistantDeltaEvents[0]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        toolUseId: 'notify-batched',
        text: 'One two three four five '
      })
    }));
    expect(assistantDeltaEvents[1]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        toolUseId: 'notify-batched',
        text: 'six seven.'
      })
    }));
    expect(streamEvents.indexOf(assistantDeltaEvents[1])).toBeLessThan(streamEvents.indexOf(completedEvent));
  });

  it('uses idle as the terminal tool for silent complete-set follow-ups', async () => {
    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeOutput.mockReturnValue({
      toolCalls: [
        {
          id: 'idle-1',
          name: 'idle',
          input: {
            reason: 'No follow-up needed'
          }
        }
      ],
      rawText: '',
      assistantMessage: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'idle-1',
            name: 'idle',
            input: {
              reason: 'No follow-up needed'
            }
          }
        ]
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        reason: 'No follow-up needed'
      }
    });

    const result = await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'ui.action.complete_set'
    });

    expect(result.outputText).toBe('');
    expect(mockExecuteToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'idle'
    }));
    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'agent.loop.completed',
      payload: expect.objectContaining({
        stopReason: 'terminal_tool',
        terminalToolName: 'idle'
      })
    }));
  });

  it('rejects plain-text leakage even when tool calls are present and retries', async () => {
    mockExtractFinalOutput
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      });

    mockNormalizeOutput
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'memory_search',
            input: {
              query: 'squat pain'
            }
          }
        ],
        rawText: 'I am checking that now.',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-2',
            name: 'message_ask_user',
            input: {
              text: 'Can you tell me more about the pain?'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        text: 'Can you tell me more about the pain?',
        delivery: 'feed'
      }
    });

    await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    const secondRequestMessages = mockBuildRequest.mock.calls[1][0].messages;
    expect(secondRequestMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('included plain text outside native tool calls')
      })
    ]));

    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'llm.response.rejected',
      payload: expect.objectContaining({
        reason: 'plain_text_not_allowed'
      })
    }));
  });

  it('rejects mixed terminal and non-terminal tool batches', async () => {
    mockExtractFinalOutput
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      });

    mockNormalizeOutput
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'memory_search',
            input: {
              query: 'bench press history'
            }
          },
          {
            id: 'tool-2',
            name: 'message_notify_user',
            input: {
              text: 'Done.',
              delivery: 'feed'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'tool-3',
            name: 'message_ask_user',
            input: {
              text: 'Which bench press session do you want me to compare?'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        text: 'Which bench press session do you want me to compare?',
        delivery: 'feed'
      }
    });

    await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(mockExecuteToolCall).toHaveBeenCalledTimes(1);
    const secondRequestMessages = mockBuildRequest.mock.calls[1][0].messages;
    expect(secondRequestMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('mixed a terminal tool with non-terminal tools')
      })
    ]));
  });

  it('does not send Anthropic top-level automatic cache control when prompt caching is enabled', async () => {
    env.anthropicPromptCachingEnabled = true;

    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeOutput.mockReturnValue({
      toolCalls: [
        {
          id: 'idle-1',
          name: 'idle',
          input: {}
        }
      ],
      rawText: '',
      assistantMessage: {
        role: 'assistant',
        content: []
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockExecuteToolCall.mockResolvedValue({
      status: 'ok',
      output: {
        reason: null
      }
    });

    await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'ui.action.complete_set'
    });

    expect(mockBuildRequest).toHaveBeenCalledWith(expect.objectContaining({
      cacheControl: null
    }));
  });

  it('writes raw provider request and response payloads when raw I/O logging is enabled', async () => {
    env.llmRawIoLoggingEnabled = true;

    mockCreateStream.mockImplementationOnce(() => ({
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: 'message_start',
          message: {
            id: 'msg_123',
            model: 'claude-sonnet-4-6'
          }
        };
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool_123',
            name: 'idle',
            input: {}
          }
        };
        yield {
          type: 'message_stop'
        };
      }
    }));

    mockExtractFinalOutput.mockResolvedValueOnce({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'idle',
            input: {}
          }
        ]
      }
    });

    mockNormalizeOutput.mockReturnValueOnce({
      toolCalls: [
        {
          type: 'tool_use',
          id: 'tool_123',
          name: 'idle',
          input: {}
        }
      ],
      rawText: '',
      assistantMessage: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'idle',
            input: {}
          }
        ]
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockExecuteToolCall.mockResolvedValueOnce({
      status: 'ok',
      output: {
        reason: null
      }
    });

    await runAgentTurn({
      run_id: 'run-raw',
      user_id: 'user-123',
      trigger_type: 'ui.action.complete_set'
    });

    expect(mockAppendRawLlmPayload).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'REQUEST',
      runId: 'run-raw',
      iteration: 1
    }));
    expect(mockAppendRawLlmPayload).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'RESPONSE',
      runId: 'run-raw',
      iteration: 1,
      payload: expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            name: 'idle'
          })
        ])
      })
    }));
  });

  it('retries when a direct user message ends with idle after a transient notify', async () => {
    mockExtractFinalOutput
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        usage: {},
        rawMessage: {}
      });

    mockNormalizeOutput
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'notify-1',
            name: 'message_notify_user',
            input: {
              text: 'Checking that now.',
              delivery: 'transient'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'idle-1',
            name: 'idle',
            input: {}
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [
          {
            id: 'notify-2',
            name: 'message_notify_user',
            input: {
              text: 'Your name is Yisroel.',
              delivery: 'feed'
            }
          }
        ],
        rawText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'end_turn',
        usage: {}
      });

    mockExecuteToolCall
      .mockResolvedValueOnce({
        status: 'ok',
        output: {
          text: 'Checking that now.',
          delivery: 'transient'
        }
      })
      .mockResolvedValueOnce({
        status: 'ok',
        output: {
          reason: null
        }
      })
      .mockResolvedValueOnce({
        status: 'ok',
        output: {
          text: 'Your name is Yisroel.',
          delivery: 'feed'
        }
      });

    const result = await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(result.outputText).toBe('Your name is Yisroel.');
    expect(mockExecuteToolCall).toHaveBeenCalledTimes(3);
    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'llm.response.rejected',
      payload: expect.objectContaining({
        reason: 'missing_durable_user_reply'
      })
    }));

    const thirdRequestMessages = mockBuildRequest.mock.calls[2][0].messages;
    expect(thirdRequestMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('without a durable user-facing reply')
      })
    ]));
  });
});
