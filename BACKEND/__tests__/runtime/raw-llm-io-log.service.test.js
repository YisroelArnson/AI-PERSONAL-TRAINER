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
  getRawLlmLogFilePath
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
        messages: [
          {
            role: 'user',
            content: 'Build my first program.'
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
            type: 'text',
            text: 'Absolutely. Let us start with three days per week.'
          }
        ]
      }
    });

    const filePath = getRawLlmLogFilePath('run-123');
    const contents = await fs.readFile(filePath, 'utf8');

    expect(contents).toContain('REQUEST run=run-123 iteration=1');
    expect(contents).toContain('"content": "Build my first program."');
    expect(contents).toContain('RESPONSE run=run-123 iteration=1');
    expect(contents).toContain('"text": "Absolutely. Let us start with three days per week."');
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
});
