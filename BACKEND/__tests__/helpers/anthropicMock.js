/**
 * Anthropic client mock for Jest.
 *
 * Usage:
 *   const { createMockAnthropicClient } = require('./helpers/anthropicMock');
 *   const aiMock = createMockAnthropicClient();
 *   getAnthropicClient.mockReturnValue(aiMock.client);
 */

function createMockAnthropicClient() {
  const mockCreate = jest.fn();

  return {
    client: {
      messages: {
        create: mockCreate
      }
    },
    mockCreate,
    mockJsonResponse: (json) => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(json) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    },
    mockTextResponse: (text) => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    },
    mockError: (error) => {
      mockCreate.mockRejectedValue(error);
    },
    reset: () => {
      mockCreate.mockReset();
    }
  };
}

module.exports = { createMockAnthropicClient };
