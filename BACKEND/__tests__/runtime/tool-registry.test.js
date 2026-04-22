/**
 * File overview:
 * Contains automated tests for the tool registry behavior.
 *
 * Main functions in this file:
 * - getToolDefinitionByName: Gets Tool definition by name needed by this file.
 * - findAnyOfVariant: Handles Find any of variant for tool-registry.test.js.
 */

jest.mock('../../src/runtime/services/memory-docs.service', () => ({
  COACH_SOUL_DOC_KEY: 'COACH_SOUL',
  getLatestDocVersionByDocType: jest.fn(),
  replaceMutableDocument: jest.fn(),
  replaceMutableDocumentText: jest.fn(),
  appendEpisodicNoteBlock: jest.fn()
}));

jest.mock('../../src/runtime/services/transcript-write.service', () => ({
  appendSessionEvent: jest.fn(),
  appendAssistantEvent: jest.fn()
}));

jest.mock('../../src/runtime/services/retrieval-search.service', () => ({
  retrievalSearch: jest.fn()
}));

jest.mock('../../src/runtime/services/timezone-date.service', () => ({
  getDateKeyInTimezone: jest.fn(() => '2026-03-27'),
  isValidDateKey: jest.fn(() => true),
  shiftDateKey: jest.fn(value => value)
}));

const {
  listToolDefinitions,
  executeToolCall
} = require('../../src/runtime/trainer-tools/tool-registry');
const {
  replaceMutableDocument
} = require('../../src/runtime/services/memory-docs.service');
const {
  appendAssistantEvent
} = require('../../src/runtime/services/transcript-write.service');

/**
 * Gets Tool definition by name needed by this file.
 */
function getToolDefinitionByName(toolName) {
  return listToolDefinitions().find(definition => definition.name === toolName);
}

/**
 * Handles Find any of variant for tool-registry.test.js.
 */
function findAnyOfVariant(schema, expectedType) {
  return (schema.anyOf || []).find(candidate => candidate.type === expectedType);
}

describe('tool-registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the trimmed tool set without redundant getter tools', () => {
    const toolNames = listToolDefinitions().map(definition => definition.name);

    expect(toolNames).toContain('workout_generate');
    expect(toolNames).toContain('workout_rewrite_remaining');
    expect(toolNames).toContain('workout_replace_exercise');
    expect(toolNames).toContain('workout_adjust_set_targets');
    expect(toolNames).toContain('workout_record_set_result');
    expect(toolNames).toContain('workout_finish_session');
    expect(toolNames).toContain('workout_history_fetch');
    expect(toolNames).toContain('document_replace_entire');
    expect(toolNames).not.toContain('memory_get');
    expect(toolNames).not.toContain('program_get');
    expect(toolNames).not.toContain('coach_soul_get');
    expect(toolNames).not.toContain('coach_soul_replace_entire');
    expect(toolNames).not.toContain('workout_get_current_state');
  });

  it('exposes the nested workout contracts in the provider-facing tool schemas', () => {
    const generateSchema = getToolDefinitionByName('workout_generate').inputSchema;
    const historySchema = getToolDefinitionByName('workout_history_fetch').inputSchema;
    const replaceSchema = getToolDefinitionByName('workout_replace_exercise').inputSchema;
    const recordSchema = getToolDefinitionByName('workout_record_set_result').inputSchema;

    expect(generateSchema.required).toEqual(['decision', 'exercises']);
    expect(generateSchema.properties.decision.required).toEqual(
      expect.arrayContaining(['decisionType', 'rationale'])
    );

    expect(replaceSchema.properties.replacement.required).toEqual(
      expect.arrayContaining(['orderIndex', 'exerciseName', 'sets'])
    );
    expect(
      replaceSchema.properties.replacement.properties.prescription.properties.trackingMode.enum
    ).toEqual(
      expect.arrayContaining(['reps_load', 'reps_only', 'duration', 'distance', 'bodyweight', 'custom'])
    );

    const replacementLoadSchema = findAnyOfVariant(
      replaceSchema.properties.replacement.properties.sets.items.properties.target.properties.load,
      'object'
    );
    const replacementLoadUnitSchema = findAnyOfVariant(
      replacementLoadSchema.properties.unit,
      'string'
    );

    expect(replacementLoadUnitSchema.enum).toEqual(expect.arrayContaining(['lb', 'kg']));

    expect(recordSchema.properties.decision.required).toEqual(
      expect.arrayContaining(['decisionType', 'rationale'])
    );

    const actualLoadSchema = findAnyOfVariant(recordSchema.properties.actual.properties.load, 'object');
    const actualLoadUnitSchema = findAnyOfVariant(actualLoadSchema.properties.unit, 'string');

    expect(actualLoadSchema.required).toEqual(['value']);
    expect(actualLoadUnitSchema.enum).toEqual(expect.arrayContaining(['lb', 'kg']));
    expect(Object.keys(historySchema.properties)).toEqual(
      expect.arrayContaining(['date', 'startDate', 'endDate', 'maxSessions', 'includeLiveSessions'])
    );
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

  it('allows COACH_SOUL to be replaced through document_replace_entire', async () => {
    replaceMutableDocument.mockResolvedValue({
      docKey: 'COACH_SOUL',
      docType: 'COACH_SOUL',
      currentVersion: 2,
      changed: true
    });

    const result = await executeToolCall({
      toolName: 'document_replace_entire',
      input: {
        doc_key: 'COACH_SOUL',
        markdown: '# COACH_SOUL.md\n\nBe direct.',
        expected_version: 1,
        reason: 'Update coaching tone'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123',
        session_key: 'user:123:main',
        session_id: 'session-123'
      }
    });

    expect(result.status).toBe('ok');
    expect(replaceMutableDocument).toHaveBeenCalledWith(expect.objectContaining({
      docKey: 'COACH_SOUL',
      expectedVersion: 1
    }));
  });

  it('returns nested workout validation errors from the declared schema', async () => {
    const result = await executeToolCall({
      toolName: 'workout_replace_exercise',
      input: {
        workoutSessionId: 'workout-123',
        workoutExerciseId: 'exercise-123',
        decision: {
          decisionType: 'user_request',
          rationale: 'User asked for a swap.'
        },
        replacement: {
          exerciseName: 'DB Single-Arm Row',
          sets: [
            {
              setIndex: 0,
              target: {
                reps: 10
              }
            }
          ]
        }
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123'
      }
    });

    expect(result).toEqual({
      toolName: 'workout_replace_exercise',
      mutating: true,
      status: 'validation_error',
      error: {
        code: 'INVALID_TOOL_INPUT',
        explanation: 'Invalid input for workout_replace_exercise: Missing required field "replacement.orderIndex".',
        agent_guidance: 'Retry the same tool using the declared schema, including all required fields and valid field values.',
        suggested_fix: {
          field: 'replacement.orderIndex',
          required_fields: ['workoutSessionId', 'workoutExerciseId', 'decision', 'replacement']
        },
        retryable_in_run: true
      }
    });
  });

  it('persists durable notify messages as assistant.notify events', async () => {
    appendAssistantEvent.mockResolvedValue({
      eventId: 'evt-notify'
    });

    const result = await executeToolCall({
      toolName: 'message_notify_user',
      input: {
        text: 'Plan is ready.',
        delivery: 'feed'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123',
        session_key: 'user:user-123:main',
        session_id: 'session-123'
      }
    });

    expect(result).toEqual({
      toolName: 'message_notify_user',
      mutating: true,
      status: 'ok',
      output: {
        kind: 'notify',
        text: 'Plan is ready.',
        delivery: 'feed'
      }
    });
    expect(appendAssistantEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'assistant.notify',
      text: 'Plan is ready.',
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'notify',
        delivery: 'feed'
      }
    }));
  });

  it('suppresses stale durable notify messages instead of appending them', async () => {
    appendAssistantEvent.mockResolvedValue({
      skipped: true,
      reason: 'stale_user_turn'
    });

    const result = await executeToolCall({
      toolName: 'message_notify_user',
      input: {
        text: 'Outdated reply.',
        delivery: 'feed'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123',
        session_key: 'user:user-123:main',
        session_id: 'session-123'
      }
    });

    expect(result).toEqual({
      toolName: 'message_notify_user',
      mutating: true,
      status: 'ok',
      output: {
        kind: 'notify',
        text: 'Outdated reply.',
        delivery: 'suppressed',
        skipped: true,
        skipReason: 'stale_user_turn'
      }
    });
    expect(appendAssistantEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'assistant.notify',
      text: 'Outdated reply.',
      requireLatestUserTurn: true
    }));
  });

  it('keeps transient notify messages stream-only', async () => {
    const result = await executeToolCall({
      toolName: 'message_notify_user',
      input: {
        text: 'Working through the next step.',
        delivery: 'transient'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123'
      }
    });

    expect(result).toEqual({
      toolName: 'message_notify_user',
      mutating: true,
      status: 'ok',
      output: {
        kind: 'notify',
        text: 'Working through the next step.',
        delivery: 'transient'
      }
    });
    expect(appendAssistantEvent).not.toHaveBeenCalled();
  });

  it('persists assistant questions as assistant.ask events', async () => {
    appendAssistantEvent.mockResolvedValue({
      eventId: 'evt-ask'
    });

    const result = await executeToolCall({
      toolName: 'message_ask_user',
      input: {
        text: 'Do you want a short session or a full one?'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123',
        session_key: 'user:user-123:main',
        session_id: 'session-123'
      }
    });

    expect(result).toEqual({
      toolName: 'message_ask_user',
      mutating: true,
      status: 'ok',
      output: {
        kind: 'ask',
        text: 'Do you want a short session or a full one?',
        delivery: 'feed'
      }
    });
    expect(appendAssistantEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'assistant.ask',
      text: 'Do you want a short session or a full one?',
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'ask',
        delivery: 'feed'
      }
    }));
  });

  it('lets idle end a run without appending a transcript message', async () => {
    const result = await executeToolCall({
      toolName: 'idle',
      input: {
        reason: 'silent follow-up not needed'
      },
      run: {
        user_id: 'user-123',
        run_id: 'run-123'
      }
    });

    expect(result).toEqual({
      toolName: 'idle',
      mutating: false,
      status: 'ok',
      output: {
        reason: 'silent follow-up not needed'
      }
    });
    expect(appendAssistantEvent).not.toHaveBeenCalled();
  });
});
