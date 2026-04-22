/**
 * File overview:
 * Implements the trainer tool handler for episodic note append.
 *
 * Main functions in this file:
 * - semanticError: Handles Semantic error for episodic-note-append.tool.js.
 * - execute: Executes the main action flow.
 */

const { appendEpisodicNoteBlock } = require('../../services/memory-docs.service');
const { appendSessionEvent } = require('../../services/transcript-write.service');
const { isValidDateKey } = require('../../services/timezone-date.service');

const definition = {
  name: 'episodic_note_append',
  category: 'memory write',
  mutating: true,
  description: 'Append a Markdown block to a date-keyed episodic note stored durably in Postgres.',
  inputSchema: {
    type: 'object',
    properties: {
      date_key: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$'
      },
      markdown_block: {
        type: 'string',
        minLength: 1
      },
      reason: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['date_key', 'markdown_block', 'reason'],
    additionalProperties: false
  }
};

/**
 * Handles Semantic error for episodic-note-append.tool.js.
 */
function semanticError(code, explanation, suggestedFix) {
  return {
    status: 'semantic_error',
    error: {
      code,
      explanation,
      agent_guidance: 'Use a valid local date key and a concrete Markdown block when appending episodic notes.',
      suggested_fix: suggestedFix,
      retryable_in_run: true
    }
  };
}

/**
 * Executes the main action flow.
 */
async function execute({ input, userId, run }) {
  if (!isValidDateKey(input.date_key)) {
    return semanticError('INVALID_DATE_KEY', 'date_key must be formatted as YYYY-MM-DD.', {
      expected_format: 'YYYY-MM-DD'
    });
  }

  const result = await appendEpisodicNoteBlock({
    userId,
    dateKey: input.date_key,
    markdownBlock: input.markdown_block,
    updatedByActor: 'agent',
    updatedByRunId: run.run_id
  });

  try {
    await appendSessionEvent({
      userId,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType: 'memory.updated',
      actor: 'tool',
      runId: run.run_id,
      payload: {
        docKey: result.docKey,
        dateKey: input.date_key,
        reason: input.reason,
        currentVersion: result.currentVersion,
        changed: result.changed !== false
      },
      idempotencyKey: `${definition.name}:${run.run_id}:${input.date_key}:${result.currentVersion}`
    });
  } catch (error) {
    console.warn('Unable to append memory.updated audit event for episodic note append:', error.message);
  }

  return {
    status: 'ok',
    output: {
      docKey: result.docKey,
      dateKey: input.date_key,
      currentVersion: result.currentVersion,
      changed: result.changed !== false,
      reason: input.reason
    }
  };
}

module.exports = {
  definition,
  execute
};
