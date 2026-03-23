const mockAppendStreamEvent = jest.fn().mockResolvedValue();
const mockAppendAssistantMessageEvent = jest.fn().mockResolvedValue();
const mockExecuteToolCall = jest.fn();
const mockBuildRequest = jest.fn(input => input);
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
    createStream: jest.fn(() => ({
      [Symbol.asyncIterator]: async function* () {}
    })),
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

describe('run-agent-turn truncated tool handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
