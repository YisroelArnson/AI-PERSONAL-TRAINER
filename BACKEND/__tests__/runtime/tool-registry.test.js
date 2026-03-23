jest.mock('../../src/runtime/services/memory-docs.service', () => ({
  COACH_SOUL_DOC_KEY: 'COACH_SOUL',
  getLatestDocVersionByDocType: jest.fn(),
  getCoachSoulDocument: jest.fn(),
  replaceCoachSoulDocument: jest.fn(),
  replaceMutableDocument: jest.fn(),
  replaceMutableDocumentText: jest.fn(),
  appendEpisodicNoteBlock: jest.fn()
}));

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: jest.fn()
}));

jest.mock('../../src/runtime/services/retrieval-search.service', () => ({
  retrievalSearch: jest.fn()
}));

jest.mock('../../src/runtime/services/timezone-date.service', () => ({
  isValidDateKey: jest.fn(() => true)
}));

const {
  listToolDefinitions,
  executeToolCall
} = require('../../src/runtime/trainer-tools/tool-registry');
const {
  replaceMutableDocument
} = require('../../src/runtime/services/memory-docs.service');

describe('tool-registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the coach soul tools', () => {
    const toolNames = listToolDefinitions().map(definition => definition.name);

    expect(toolNames).toContain('coach_soul_get');
    expect(toolNames).toContain('coach_soul_replace_entire');
  });

  it('returns a validation error before executing a tool with missing required fields', async () => {
    const result = await executeToolCall({
      toolName: 'document_replace_entire',
      input: {
        doc_key: 'MEMORY',
        markdown: '# Updated memory',
        reason: 'sync durable memory'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123'
      }
    });

    expect(result).toEqual({
      toolName: 'document_replace_entire',
      mutating: true,
      status: 'validation_error',
      error: {
        code: 'INVALID_TOOL_INPUT',
        explanation: 'Invalid input for document_replace_entire: Missing required field "expected_version".',
        agent_guidance: 'Retry the same tool using the declared schema, including all required fields and valid field values.',
        suggested_fix: {
          field: 'expected_version',
          required_fields: ['doc_key', 'markdown', 'expected_version', 'reason']
        },
        retryable_in_run: true
      }
    });
    expect(replaceMutableDocument).not.toHaveBeenCalled();
  });
});
