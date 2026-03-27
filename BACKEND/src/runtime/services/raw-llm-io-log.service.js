const fs = require('node:fs/promises');
const path = require('node:path');
const { env } = require('../../config/env');

function prettyPrintRawPayload(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return JSON.stringify({
      serializationError: error.message,
      preview: String(payload)
    }, null, 2);
  }
}

function sanitizeRunId(runId) {
  return String(runId || 'unknown-run').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getRawLlmLogDirectory() {
  return env.llmRawIoLoggingDirectory;
}

function getRawLlmLogFilePath(runId) {
  return path.join(getRawLlmLogDirectory(), `${sanitizeRunId(runId)}.log`);
}

async function appendRawLlmPayload({ phase, runId, iteration, payload }) {
  if (!env.llmRawIoLoggingEnabled) {
    return null;
  }

  try {
    const directory = getRawLlmLogDirectory();
    const filePath = getRawLlmLogFilePath(runId);
    const suffix = [`run=${runId}`, iteration ? `iteration=${iteration}` : null]
      .filter(Boolean)
      .join(' ');
    const entry = [
      `[${new Date().toISOString()}] ${phase}${suffix ? ` ${suffix}` : ''}`,
      prettyPrintRawPayload(payload),
      ''
    ].join('\n');

    await fs.mkdir(directory, { recursive: true });
    await fs.appendFile(filePath, entry, 'utf8');

    return filePath;
  } catch (error) {
    return null;
  }
}

module.exports = {
  appendRawLlmPayload,
  getRawLlmLogDirectory,
  getRawLlmLogFilePath,
  prettyPrintRawPayload
};
