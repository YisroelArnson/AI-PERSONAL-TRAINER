const { COACH_SOUL_DOC_KEY, replaceMutableDocument } = require('../../services/memory-docs.service');
const { appendSessionEvent } = require('../../services/transcript-write.service');

const definition = {
  name: 'document_replace_entire',
  category: 'document mutation',
  mutating: true,
  description: 'Replace the full contents of the durable MEMORY, PROGRAM, or COACH_SOUL Markdown document using optimistic concurrency.',
  inputSchema: {
    type: 'object',
    properties: {
      doc_key: {
        type: 'string',
        enum: ['MEMORY', 'PROGRAM', COACH_SOUL_DOC_KEY]
      },
      markdown: {
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
    required: ['doc_key', 'markdown', 'expected_version', 'reason'],
    additionalProperties: false
  }
};

function semanticError(code, explanation, suggestedFix) {
  return {
    status: 'semantic_error',
    error: {
      code,
      explanation,
      agent_guidance: 'Use the current document version already included in prompt context, then retry with the correct expected_version and desired change.',
      suggested_fix: suggestedFix,
      retryable_in_run: true
    }
  };
}

async function appendAuditEvent({ userId, run, docKey, reason, result }) {
  const eventType = docKey === 'PROGRAM'
    ? 'program.updated'
    : docKey === COACH_SOUL_DOC_KEY
      ? 'coach_soul.updated'
      : 'memory.updated';

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

async function execute({ input, userId, run }) {
  try {
    const result = await replaceMutableDocument({
      userId,
      docKey: input.doc_key,
      markdown: input.markdown,
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
        `Only MEMORY, PROGRAM, and ${COACH_SOUL_DOC_KEY} can be replaced directly. ${input.doc_key} is not a mutable document target.`,
        {
          allowed_doc_keys: ['MEMORY', 'PROGRAM', COACH_SOUL_DOC_KEY]
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
