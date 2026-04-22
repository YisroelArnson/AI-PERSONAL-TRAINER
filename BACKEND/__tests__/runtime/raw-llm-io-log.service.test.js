/**
 * File overview:
 * Contains automated tests for the raw llm io log service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../src/config/env', () => ({
  env: {
    llmRawIoLoggingEnabled: true,
    llmRawIoLoggingDirectory: ''
  }
}));

const { env } = require('../../src/config/env');
const {
  appendRawLlmPayload,
  getRawLlmLogFilePath,
  insertEntryIntoDocument
} = require('../../src/runtime/services/raw-llm-io-log.service');

describe('raw-llm-io-log.service', () => {
  let tempDirectory;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-personal-trainer-llm-logs-'));
    env.llmRawIoLoggingEnabled = true;
    env.llmRawIoLoggingDirectory = tempDirectory;
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('writes prettified request and response payloads to a per-run file', async () => {
    await appendRawLlmPayload({
      phase: 'REQUEST',
      runId: 'run-123',
      iteration: 1,
      payload: {
        system: 'You are a coach.',
        messages: [
          {
            role: 'user',
            content: 'Build my first program.'
          }
        ],
        tools: [
          {
            name: 'document_replace_entire',
            input_schema: {}
          }
        ]
      }
    });

    await appendRawLlmPayload({
      phase: 'RESPONSE',
      runId: 'run-123',
      iteration: 1,
      payload: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'document_replace_entire',
            input: {
              doc_key: 'PROGRAM'
            }
          },
          {
            type: 'text',
            text: 'Absolutely. Let us start with three days per week.'
          }
        ]
      }
    });

    const filePath = getRawLlmLogFilePath('run-123');
    const contents = await fs.readFile(filePath, 'utf8');

    expect(filePath.endsWith('.html')).toBe(true);
    expect(contents).toContain('REQUEST • iteration 1 • run run-123');
    expect(contents).toContain('Prompt');
    expect(contents).toContain('Tooling');
    expect(contents).toContain('Messages');
    expect(contents).toContain('Tool Use');
    expect(contents).toContain('Raw JSON');
    expect(contents).toContain('&quot;content&quot;: &quot;Build my first program.&quot;');
    expect(contents).toContain('&quot;name&quot;: &quot;document_replace_entire&quot;');
    expect(contents).toContain('&quot;text&quot;: &quot;Absolutely. Let us start with three days per week.&quot;');
  });

  it('returns null and skips file writes when raw I/O logging is disabled', async () => {
    env.llmRawIoLoggingEnabled = false;

    const result = await appendRawLlmPayload({
      phase: 'REQUEST',
      runId: 'run-disabled',
      iteration: 1,
      payload: {
        message: 'hello'
      }
    });

    await expect(fs.access(getRawLlmLogFilePath('run-disabled'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
    expect(result).toBeNull();
  });

  it('preserves literal dollar signs when appending later entries', async () => {
    const initialDocument = [
      '<section>',
      '  <!-- RAW_LLM_IO_ENTRY_INSERT_MARKER -->',
      '</section>'
    ].join('\n');
    const firstEntry = '<pre>^\\d{4}-\\d{2}-\\d{2}$</pre>';
    const secondEntry = '<details><summary>RESPONSE</summary></details>';

    const withFirstEntry = insertEntryIntoDocument(initialDocument, firstEntry);
    const withSecondEntry = insertEntryIntoDocument(withFirstEntry, secondEntry);

    expect(withSecondEntry).toContain('<pre>^\\d{4}-\\d{2}-\\d{2}$</pre>');
    expect(withSecondEntry).toContain('<details><summary>RESPONSE</summary></details>');
    expect(withSecondEntry).not.toContain('^\\d{4}-\\d{2}-\\d{2}<details><summary>RESPONSE</summary>');
  });
});
