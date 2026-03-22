const { replaceCoachSoulDocument, COACH_SOUL_DOC_KEY } = require('../../services/memory-docs.service');
const { appendSessionEvent } = require('../../services/transcript-write.service');

const definition = {
  name: 'coach_soul_replace_entire',
  category: 'document mutation',
  mutating: true,
  description: 'Replace the full durable COACH_SOUL Markdown document using optimistic concurrency.',
  inputSchema: {
    type: 'object',
    properties: {
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
    required: ['markdown', 'expected_version', 'reason'],
    additionalProperties: false
  }
};

function semanticError(code, explanation, suggestedFix) {
  return {
    status: 'semantic_error',
    error: {
      code,
      explanation,
      agent_guidance: 'Read the latest coach soul first, then retry with the correct expected_version and intended change.',
      suggested_fix: suggestedFix,
      retryable_in_run: true
    }
  };
}

async function appendAuditEvent({ userId, run, reason, result }) {
  try {
    await appendSessionEvent({
      userId,
      sessionKey: run.session_key,
      sessionId: run.session_id,
      eventType: 'coach_soul.updated',
      actor: 'tool',
      runId: run.run_id,
      payload: {
        docKey: COACH_SOUL_DOC_KEY,
        reason,
        currentVersion: result.currentVersion,
        changed: result.changed !== false
      },
      idempotencyKey: `${definition.name}:${run.run_id}:${result.currentVersion}`
    });
  } catch (error) {
    console.warn('Unable to append coach_soul.updated audit event:', error.message);
  }
}

async function execute({ input, userId, run }) {
  try {
    const result = await replaceCoachSoulDocument({
      userId,
      markdown: input.markdown,
      expectedVersion: input.expected_version,
      updatedByActor: 'agent',
      updatedByRunId: run.run_id
    });

    if (result.changed !== false) {
      await appendAuditEvent({
        userId,
        run,
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
        `The current ${COACH_SOUL_DOC_KEY} version no longer matches expected_version ${input.expected_version}.`,
        {
          suggested_tool: 'coach_soul_get'
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
