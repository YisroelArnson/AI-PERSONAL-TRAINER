const mockAppendStreamEvent = jest.fn().mockResolvedValue();
const mockAppendAssistantMessageEvent = jest.fn().mockResolvedValue();
const mockExecuteToolCall = jest.fn();
const mockBuildRequest = jest.fn(input => input);
const mockCreateStream = jest.fn(() => ({
  on: jest.fn(),
  [Symbol.asyncIterator]: async function* () {}
}));
const mockExtractFinalOutput = jest.fn();
const mockNormalizeAnthropicOutput = jest.fn();
const mockGetStopDecision = jest.fn();

jest.mock('../../src/config/env', () => ({
  env: {
    defaultLlmProvider: 'anthropic',
    defaultAnthropicModel: 'claude-sonnet-4-6',
    agentMaxIterations: 3,
    agentMaxOutputTokens: 4000,
    agentPromptMessageLimit: 12,
    llmRawIoLoggingEnabled: false,
    anthropicPromptCachingEnabled: false,
    anthropicConversationCacheTtl: '5m',
    anthropicStaticCacheTtl: '5m'
  }
}));

jest.mock('../../src/runtime/services/stream-events.service', () => ({
  appendStreamEvent: mockAppendStreamEvent
}));

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendAssistantMessageEvent: mockAppendAssistantMessageEvent
}));

jest.mock('../../src/runtime/agent-runtime/provider-registry', () => ({
  getProviderAdapter: jest.fn(() => ({
    validateCapabilities: jest.fn(),
    buildRequest: mockBuildRequest,
    createStream: mockCreateStream,
    normalizeStreamEvent: jest.fn(() => null),
    extractFinalOutput: mockExtractFinalOutput,
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
  normalizeAnthropicOutput: mockNormalizeAnthropicOutput,
  buildToolResultMessage: jest.fn()
}));

jest.mock('../../src/runtime/agent-runtime/stop-conditions', () => ({
  getStopDecision: mockGetStopDecision
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
    }
  ]),
  executeToolCall: mockExecuteToolCall
}));

const { runAgentTurn } = require('../../src/runtime/agent-runtime/run-agent-turn');
const { env } = require('../../src/config/env');

describe('run-agent-turn truncated tool handling', () => {
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    env.llmRawIoLoggingEnabled = false;
    env.anthropicPromptCachingEnabled = false;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCreateStream.mockImplementation(() => ({
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {}
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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

    mockNormalizeAnthropicOutput
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
        outputText: '',
        assistantMessage: {
          role: 'assistant',
          content: []
        },
        stopReason: 'max_tokens',
        usage: {}
      })
      .mockReturnValueOnce({
        toolCalls: [],
        outputText: 'Saved cleanly.',
        assistantMessage: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Saved cleanly.'
            }
          ]
        },
        stopReason: 'end_turn',
        usage: {}
      });

    mockGetStopDecision.mockImplementation(({ normalizedOutput }) => (
      normalizedOutput.toolCalls.length === 0
        ? { shouldStop: true, reason: 'final_response' }
        : { shouldStop: false, reason: 'tool_calls_requested' }
    ));

    const result = await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(result.outputText).toBe('Saved cleanly.');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
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
    expect(mockAppendAssistantMessageEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Saved cleanly.'
    }));
  });

  it('records request failures when stream creation throws synchronously', async () => {
    mockCreateStream.mockImplementationOnce(() => {
      throw new Error('prefill invalid');
    });
    mockGetStopDecision.mockReturnValue({
      shouldStop: true,
      reason: 'final_response'
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

  it('suppresses assistant transcript writes when a ui complete-set run returns no_reply', async () => {
    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeAnthropicOutput.mockReturnValue({
      toolCalls: [],
      outputText: 'no_reply',
      assistantMessage: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'no_reply'
          }
        ]
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockGetStopDecision.mockReturnValue({
      shouldStop: true,
      reason: 'final_response'
    });

    const result = await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'ui.action.complete_set'
    });

    expect(result.outputText).toBe('');
    expect(mockAppendAssistantMessageEvent).not.toHaveBeenCalled();
    expect(mockAppendStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'assistant.reply.suppressed',
      payload: expect.objectContaining({
        reason: 'no_reply',
        triggerType: 'ui.action.complete_set'
      })
    }));
  });

  it('does not send Anthropic top-level automatic cache control when prompt caching is enabled', async () => {
    env.anthropicPromptCachingEnabled = true;

    mockExtractFinalOutput.mockResolvedValue({
      stopReason: 'end_turn',
      usage: {},
      rawMessage: {}
    });

    mockNormalizeAnthropicOutput.mockReturnValue({
      toolCalls: [],
      outputText: 'Saved cleanly.',
      assistantMessage: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Saved cleanly.'
          }
        ]
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockGetStopDecision.mockReturnValue({
      shouldStop: true,
      reason: 'final_response'
    });

    await runAgentTurn({
      run_id: 'run-123',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(mockBuildRequest).toHaveBeenCalledWith(expect.objectContaining({
      cacheControl: null
    }));
  });

  it('prints raw provider request, content blocks, and response payloads when raw I/O logging is enabled', async () => {
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
            name: 'document_replace_entire',
            input: {}
          }
        };
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"doc_key":"PROGRAM"}'
          }
        };
        yield {
          type: 'content_block_stop',
          index: 0
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
            name: 'document_replace_entire',
            input: {
              doc_key: 'PROGRAM'
            }
          }
        ]
      }
    });

    mockNormalizeAnthropicOutput.mockReturnValueOnce({
      toolCalls: [
        {
          type: 'tool_use',
          id: 'tool_123',
          name: 'document_replace_entire',
          input: {
            doc_key: 'PROGRAM'
          }
        }
      ],
      outputText: '',
      assistantMessage: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'document_replace_entire',
            input: {
              doc_key: 'PROGRAM'
            }
          }
        ]
      },
      stopReason: 'end_turn',
      usage: {}
    });

    mockGetStopDecision.mockReturnValueOnce({
      shouldStop: false,
      reason: 'tool_calls_requested'
    });
    mockExecuteToolCall.mockResolvedValueOnce({
      status: 'success',
      result: {}
    });

    await runAgentTurn({
      run_id: 'run-raw',
      user_id: 'user-123',
      trigger_type: 'user.message'
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('[LLM RAW FINAL MESSAGE run=run-raw iteration=1]');
    expect(consoleLogSpy).toHaveBeenCalledWith('[LLM RAW FINAL CONTENT run=run-raw iteration=1]');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"doc_key": "PROGRAM"'));
  });
});
