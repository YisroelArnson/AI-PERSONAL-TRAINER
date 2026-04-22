/**
 * File overview:
 * Implements runtime service logic for raw llm io log.
 *
 * Main functions in this file:
 * - prettyPrintRawPayload: Handles Pretty print raw payload for raw-llm-io-log.service.js.
 * - sanitizeRunId: Handles Sanitize run ID for raw-llm-io-log.service.js.
 * - getRawLlmLogDirectory: Gets Raw LLM log directory needed by this file.
 * - getRawLlmLogFilePath: Gets Raw LLM log file path needed by this file.
 * - escapeHtml: Handles Escape HTML for raw-llm-io-log.service.js.
 * - formatJson: Formats JSON for display or logging.
 * - renderPre: Renders Pre for the caller.
 * - renderSection: Renders Section for the caller.
 * - renderJsonDetails: Renders JSON details for the caller.
 * - renderCollectionItem: Renders Collection item for the caller.
 * - renderCollectionSection: Renders Collection section for the caller.
 * - renderPromptSections: Renders Prompt sections for the caller.
 * - getResponseContentBlocks: Gets Response content blocks needed by this file.
 * - getToolUseBlocks: Gets Tool use blocks needed by this file.
 * - renderResponseSections: Renders Response sections for the caller.
 * - renderPhaseSections: Renders Phase sections for the caller.
 * - renderEntryHtml: Renders Entry HTML for the caller.
 * - renderHtmlDocument: Renders HTML document for the caller.
 * - insertEntryIntoDocument: Handles Insert entry into document for raw-llm-io-log.service.js.
 * - appendRawLlmPayload: Appends Raw LLM payload to the existing record.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { env } = require('../../config/env');

const ENTRY_INSERT_MARKER = '<!-- RAW_LLM_IO_ENTRY_INSERT_MARKER -->';

/**
 * Handles Pretty print raw payload for raw-llm-io-log.service.js.
 */
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

/**
 * Handles Sanitize run ID for raw-llm-io-log.service.js.
 */
function sanitizeRunId(runId) {
  return String(runId || 'unknown-run').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Gets Raw LLM log directory needed by this file.
 */
function getRawLlmLogDirectory() {
  return env.llmRawIoLoggingDirectory;
}

/**
 * Gets Raw LLM log file path needed by this file.
 */
function getRawLlmLogFilePath(runId) {
  return path.join(getRawLlmLogDirectory(), `${sanitizeRunId(runId)}.html`);
}

/**
 * Handles Escape HTML for raw-llm-io-log.service.js.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats JSON for display or logging.
 */
function formatJson(value) {
  return prettyPrintRawPayload(value);
}

/**
 * Renders Pre for the caller.
 */
function renderPre(value) {
  return `<pre>${escapeHtml(typeof value === 'string' ? value : formatJson(value))}</pre>`;
}

/**
 * Renders Section for the caller.
 */
function renderSection(title, bodyHtml) {
  return [
    '<details class="section">',
    `  <summary>${escapeHtml(title)}</summary>`,
    '  <div class="section-body">',
    bodyHtml,
    '  </div>',
    '</details>'
  ].join('\n');
}

/**
 * Renders JSON details for the caller.
 */
function renderJsonDetails(title, value) {
  return renderSection(title, renderPre(value));
}

/**
 * Renders Collection item for the caller.
 */
function renderCollectionItem(label, value) {
  return [
    '<details class="item">',
    `  <summary>${escapeHtml(label)}</summary>`,
    '  <div class="section-body">',
    renderPre(value),
    '  </div>',
    '</details>'
  ].join('\n');
}

/**
 * Renders Collection section for the caller.
 */
function renderCollectionSection(title, values, labelBuilder) {
  if (!Array.isArray(values) || values.length === 0) {
    return renderJsonDetails(title, []);
  }

  return renderSection(
    `${title} (${values.length})`,
    values.map((value, index) => renderCollectionItem(labelBuilder(value, index), value)).join('\n')
  );
}

/**
 * Renders Prompt sections for the caller.
 */
function renderPromptSections(payload) {
  return [
    renderSection('Prompt', [
      renderJsonDetails('System', Object.prototype.hasOwnProperty.call(payload || {}, 'system') ? payload.system : null),
      renderCollectionSection(
        'Messages',
        Array.isArray(payload && payload.messages) ? payload.messages : [],
        (message, index) => {
          const role = message && message.role ? String(message.role) : 'message';
          return `Message ${index + 1} (${role})`;
        }
      )
    ].join('\n')),
    renderSection('Tooling', [
      renderJsonDetails('Tool Choice', Object.prototype.hasOwnProperty.call(payload || {}, 'tool_choice') ? payload.tool_choice : null),
      renderCollectionSection(
        'Tools',
        Array.isArray(payload && payload.tools) ? payload.tools : [],
        (tool, index) => {
          const name = tool && tool.name ? String(tool.name) : `tool-${index + 1}`;
          return `Tool ${index + 1}: ${name}`;
        }
      )
    ].join('\n')),
    renderSection('Request Metadata', [
      renderJsonDetails('Model', Object.prototype.hasOwnProperty.call(payload || {}, 'model') ? payload.model : null),
      renderJsonDetails('Max Tokens', Object.prototype.hasOwnProperty.call(payload || {}, 'max_tokens') ? payload.max_tokens : null),
      renderJsonDetails('Metadata', Object.prototype.hasOwnProperty.call(payload || {}, 'metadata') ? payload.metadata : null),
      renderJsonDetails('Cache Control', Object.prototype.hasOwnProperty.call(payload || {}, 'cache_control') ? payload.cache_control : null)
    ].join('\n'))
  ].join('\n');
}

/**
 * Gets Response content blocks needed by this file.
 */
function getResponseContentBlocks(payload) {
  if (!payload || !Array.isArray(payload.content)) {
    return [];
  }

  return payload.content;
}

/**
 * Gets Tool use blocks needed by this file.
 */
function getToolUseBlocks(payload) {
  return getResponseContentBlocks(payload).filter(block => block && block.type === 'tool_use');
}

/**
 * Renders Response sections for the caller.
 */
function renderResponseSections(payload) {
  const contentBlocks = getResponseContentBlocks(payload);
  const toolUseBlocks = getToolUseBlocks(payload);

  return [
    renderCollectionSection(
      'Messages',
      contentBlocks,
      (block, index) => {
        const type = block && block.type ? String(block.type) : 'block';
        return `Content Block ${index + 1} (${type})`;
      }
    ),
    renderCollectionSection(
      'Tool Use',
      toolUseBlocks,
      (block, index) => {
        const name = block && block.name ? String(block.name) : `tool-${index + 1}`;
        return `Tool Use ${index + 1}: ${name}`;
      }
    ),
    renderSection('Response Metadata', [
      renderJsonDetails('Role', Object.prototype.hasOwnProperty.call(payload || {}, 'role') ? payload.role : null),
      renderJsonDetails('Model', Object.prototype.hasOwnProperty.call(payload || {}, 'model') ? payload.model : null),
      renderJsonDetails('Stop Reason', Object.prototype.hasOwnProperty.call(payload || {}, 'stop_reason') ? payload.stop_reason : null),
      renderJsonDetails('Stop Sequence', Object.prototype.hasOwnProperty.call(payload || {}, 'stop_sequence') ? payload.stop_sequence : null),
      renderJsonDetails('Usage', Object.prototype.hasOwnProperty.call(payload || {}, 'usage') ? payload.usage : null),
      renderJsonDetails('Message Id', Object.prototype.hasOwnProperty.call(payload || {}, 'id') ? payload.id : null)
    ].join('\n'))
  ].join('\n');
}

/**
 * Renders Phase sections for the caller.
 */
function renderPhaseSections(phase, payload) {
  if (phase === 'REQUEST') {
    return renderPromptSections(payload);
  }

  if (phase === 'RESPONSE') {
    return renderResponseSections(payload);
  }

  return renderJsonDetails('Data', payload);
}

/**
 * Renders Entry HTML for the caller.
 */
function renderEntryHtml({ phase, runId, iteration, payload, timestamp }) {
  const summaryParts = [
    phase,
    `iteration ${iteration || 'n/a'}`,
    `run ${runId}`,
    new Date(timestamp).toLocaleString()
  ];

  return [
    '<details class="entry">',
    `  <summary>${escapeHtml(summaryParts.join(' • '))}</summary>`,
    '  <div class="entry-body">',
    renderPhaseSections(phase, payload),
    renderJsonDetails('Raw JSON', payload),
    '  </div>',
    '</details>'
  ].join('\n');
}

/**
 * Renders HTML document for the caller.
 */
function renderHtmlDocument({ runId }) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(`LLM Run ${runId}`)}</title>`,
    '  <style>',
    '    :root { color-scheme: light; }',
    '    body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f1ea; color: #1f2328; }',
    '    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }',
    '    h1 { margin: 0 0 8px; font-size: 28px; }',
    '    p { margin: 0 0 20px; color: #4b5563; }',
    '    details { border: 1px solid #d4c7b8; border-radius: 14px; background: #fffdf9; }',
    '    details + details { margin-top: 14px; }',
    '    summary { cursor: pointer; padding: 14px 16px; font-weight: 600; }',
    '    .entry { margin-top: 18px; box-shadow: 0 10px 30px rgba(95, 74, 50, 0.08); }',
    '    .entry-body { padding: 0 16px 16px; display: grid; gap: 12px; }',
    '    .section-body { padding: 0 14px 14px; }',
    '    .item { margin-top: 10px; }',
    '    pre { margin: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; background: #f7f2ea; border-radius: 10px; padding: 14px; border: 1px solid #eadfce; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; }',
    '    .controls { display: flex; gap: 10px; margin: 16px 0 22px; }',
    '    button { border: 0; border-radius: 999px; padding: 10px 14px; background: #8a5a2b; color: white; font-weight: 600; cursor: pointer; }',
    '    button.secondary { background: #d7c4ad; color: #3a2b1c; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    `    <h1>${escapeHtml(`LLM Run ${runId}`)}</h1>`,
    '    <p>Collapsed HTML log for one run. Each section keeps the full raw JSON alongside easier-to-scan prompt, tooling, and message views.</p>',
    '    <div class="controls">',
    '      <button type="button" onclick="toggleAll(true)">Expand all</button>',
    '      <button type="button" class="secondary" onclick="toggleAll(false)">Collapse all</button>',
    '    </div>',
    '    <section id="entries">',
    `      ${ENTRY_INSERT_MARKER}`,
    '    </section>',
    '  </main>',
    '  <script>',
    '    function toggleAll(expanded) {',
    '      document.querySelectorAll("details").forEach(detail => {',
    '        detail.open = expanded;',
    '      });',
    '    }',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

/**
 * Handles Insert entry into document for raw-llm-io-log.service.js.
 */
function insertEntryIntoDocument(documentHtml, entry) {
  const markerIndex = documentHtml.lastIndexOf(ENTRY_INSERT_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  return [
    documentHtml.slice(0, markerIndex),
    entry,
    '\n      ',
    ENTRY_INSERT_MARKER,
    documentHtml.slice(markerIndex + ENTRY_INSERT_MARKER.length)
  ].join('');
}

/**
 * Appends Raw LLM payload to the existing record.
 */
async function appendRawLlmPayload({ phase, runId, iteration, payload }) {
  if (!env.llmRawIoLoggingEnabled) {
    return null;
  }

  try {
    const directory = getRawLlmLogDirectory();
    const filePath = getRawLlmLogFilePath(runId);
    const timestamp = new Date().toISOString();
    const entry = renderEntryHtml({
      phase,
      runId,
      iteration,
      payload,
      timestamp
    });

    await fs.mkdir(directory, { recursive: true });
    let documentHtml = renderHtmlDocument({ runId });

    try {
      documentHtml = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!documentHtml.includes(ENTRY_INSERT_MARKER)) {
      documentHtml = renderHtmlDocument({ runId });
    }

    const nextDocumentHtml = insertEntryIntoDocument(documentHtml, entry);

    if (!nextDocumentHtml) {
      documentHtml = renderHtmlDocument({ runId });
      documentHtml = insertEntryIntoDocument(documentHtml, entry);
    } else {
      documentHtml = nextDocumentHtml;
    }

    await fs.writeFile(filePath, documentHtml, 'utf8');

    return filePath;
  } catch (error) {
    return null;
  }
}

module.exports = {
  appendRawLlmPayload,
  getRawLlmLogDirectory,
  getRawLlmLogFilePath,
  insertEntryIntoDocument,
  prettyPrintRawPayload
};
