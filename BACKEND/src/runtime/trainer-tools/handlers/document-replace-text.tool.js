/**
 * File overview:
 * Implements the trainer tool handler for document replace text.
 *
 * Main functions in this file:
 * - semanticError: Handles Semantic error for document-replace-text.tool.js.
 * - appendAuditEvent: Appends Audit event to the existing record.
 * - execute: Executes the main action flow.
 */

const { replaceMutableDocumentText } = require('../../services/memory-docs.service');
const { appendSessionEvent } = require('../../services/transcript-write.service');

const definition = {
  name: 'document_replace_text',
  category: 'document mutation',
  mutating: true,
  description: 'Replace one exact text span inside the durable MEMORY or PROGRAM Markdown document using optimistic concurrency.',
  inputSchema: {
    type: 'object',
    properties: {
      doc_key: {
        type: 'string',
        enum: ['MEMORY', 'PROGRAM']
      },
      old_text: {
        type: 'string',
        minLength: 1
      },
      new_text: {
        type: 'string'
      },
      expected_version: {
        type: 'integer',
        minimum: 0
      },
      reason: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['doc_key', 'old_text', 'new_text', 'expected_version', 'reason'],
    additionalProperties: false
  }
};

/**
 * Handles Semantic error for document-replace-text.tool.js.
 */
function semanticError(code, explanation, suggestedFix) {
  return {
    status: 'semantic_error',
    error: {
      code,
      explanation,
      agent_guidance: 'Use the current document version and exact text already included in prompt context, then retry with an exact single-span replacement.',
      suggested_fix: suggestedFix,
      retryable_in_run: true
    }
  };
}

/**
 * Appends Audit event to the existing record.
 */
async function appendAuditEvent({ userId, run, docKey, reason, result }) {
  const eventType = docKey === 'PROGRAM' ? 'program.updated' : 'memory.updated';

  try {
    await appendSessionEvent({
      userId,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType,
      actor: 'tool',
      runId: run.run_id,
      payload: {
        docKey,
        reason,
        currentVersion: result.currentVersion,
        changed: result.changed !== false
      },
      idempotencyKey: `${definition.name}:${run.run_id}:${docKey}:${result.currentVersion}`
    });
  } catch (error) {
    console.warn(`Unable to append ${eventType} audit event:`, error.message);
  }
}

/**
 * Executes the main action flow.
 */
async function execute({ input, userId, run }) {
  try {
    const result = await replaceMutableDocumentText({
      userId,
      docKey: input.doc_key,
      oldText: input.old_text,
      newText: input.new_text,
      expectedVersion: input.expected_version,
      updatedByActor: 'agent',
      updatedByRunId: run.run_id
    });

    if (result.changed !== false) {
      await appendAuditEvent({
        userId,
        run,
        docKey: input.doc_key,
        reason: input.reason,
        result
      });
    }

    return {
      status: 'ok',
      output: {
        docKey: result.docKey,
        docType: result.docType,
        currentVersion: result.currentVersion,
        changed: result.changed !== false,
        reason: input.reason
      }
    };
  } catch (error) {
    if (error && error.message && error.message.includes('VERSION_MISMATCH')) {
      return semanticError(
        'VERSION_MISMATCH',
        `The current ${input.doc_key} version no longer matches expected_version ${input.expected_version}.`,
        {
          doc_key: input.doc_key,
          current_version_source: 'prompt_context'
        }
      );
    }

    if (error && error.message === 'DOC_KEY_NOT_MUTABLE') {
      return semanticError(
        'DOC_KEY_NOT_MUTABLE',
        `Only MEMORY and PROGRAM support targeted text replacement. ${input.doc_key} is not valid here.`,
        {
          allowed_doc_keys: ['MEMORY', 'PROGRAM']
        }
      );
    }

    if (error && error.message === 'TEXT_NOT_FOUND') {
      return semanticError(
        'TEXT_NOT_FOUND',
        'The exact old_text span was not found in the current document.',
        {
          doc_key: input.doc_key,
          content_source: 'prompt_context'
        }
      );
    }

    if (error && error.message === 'TEXT_NOT_UNIQUE') {
      return semanticError(
        'TEXT_NOT_UNIQUE',
        'The old_text span appears multiple times. Use a more specific exact span or replace the entire document.',
        {
          suggested_tool: 'document_replace_entire'
        }
      );
    }

    throw error;
  }
}

module.exports = {
  definition,
  execute
};
