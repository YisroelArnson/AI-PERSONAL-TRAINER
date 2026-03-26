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

function getToolDefinitionByName(toolName) {
  return listToolDefinitions().find(definition => definition.name === toolName);
}

function findAnyOfVariant(schema, expectedType) {
  return (schema.anyOf || []).find(candidate => candidate.type === expectedType);
}

describe('tool-registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the coach soul tools', () => {
    const toolNames = listToolDefinitions().map(definition => definition.name);

    expect(toolNames).toContain('coach_soul_get');
    expect(toolNames).toContain('coach_soul_replace_entire');
    expect(toolNames).toContain('workout_generate');
    expect(toolNames).toContain('workout_get_current_state');
    expect(toolNames).toContain('workout_rewrite_remaining');
    expect(toolNames).toContain('workout_replace_exercise');
    expect(toolNames).toContain('workout_adjust_set_targets');
    expect(toolNames).toContain('workout_record_set_result');
    expect(toolNames).toContain('workout_finish_session');
  });

  it('exposes the nested workout contracts in the provider-facing tool schemas', () => {
    const generateSchema = getToolDefinitionByName('workout_generate').inputSchema;
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
});
