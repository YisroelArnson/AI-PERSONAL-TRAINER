const mockGetLatestDocVersionByDocKey = jest.fn();
const mockGetLatestDocVersionByDocType = jest.fn();
const mockGetPromptContextForRun = jest.fn();
const mockListBootstrapEpisodicNotes = jest.fn();
const mockFormatBootstrapEpisodicNotes = jest.fn();
const mockResolveSessionContinuityPolicy = jest.fn();
const mockLoadStaticPromptLayer = jest.fn();
const mockGetCurrentWorkoutState = jest.fn();

jest.mock('../../src/runtime/services/memory-docs.service', () => ({
  getLatestDocVersionByDocKey: mockGetLatestDocVersionByDocKey,
  getLatestDocVersionByDocType: mockGetLatestDocVersionByDocType
}));

jest.mock('../../src/runtime/services/prompt-context-cache.service', () => ({
  getPromptContextForRun: mockGetPromptContextForRun
}));

jest.mock('../../src/runtime/services/episodic-notes.service', () => ({
  listBootstrapEpisodicNotes: mockListBootstrapEpisodicNotes,
  formatBootstrapEpisodicNotes: mockFormatBootstrapEpisodicNotes
}));

jest.mock('../../src/runtime/services/session-reset-policy.service', () => ({
  resolveSessionContinuityPolicy: mockResolveSessionContinuityPolicy
}));

jest.mock('../../src/runtime/services/static-prompt-layers.service', () => ({
  loadStaticPromptLayer: mockLoadStaticPromptLayer
}));

jest.mock('../../src/runtime/services/workout-state.service', () => ({
  getCurrentWorkoutState: mockGetCurrentWorkoutState
}));

const { env } = require('../../src/config/env');
const {
  assemblePrompt,
  shouldLoadBootstrapInstructions,
  buildVersionedDocumentMarkdown
} = require('../../src/runtime/agent-runtime/prompt-assembly');

describe('prompt-assembly bootstrap behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.anthropicPromptCachingEnabled = true;
    env.anthropicStaticCacheTtl = '5m';
    env.anthropicDynamicContextCacheTtl = '5m';
    mockLoadStaticPromptLayer.mockImplementation(async (_filename, fallback) => fallback);
    mockGetPromptContextForRun.mockResolvedValue({
      messages: [
        {
          role: 'user',
          content: 'What should I do today?'
        }
      ],
      cacheHit: false,
      sourceEventIds: []
    });
    mockListBootstrapEpisodicNotes.mockResolvedValue([]);
    mockFormatBootstrapEpisodicNotes.mockReturnValue('');
    mockResolveSessionContinuityPolicy.mockResolvedValue({
      timezone: 'America/New_York',
      episodicReadStrategy: 'today',
      episodicCustomWindowDays: null
    });
    mockGetLatestDocVersionByDocKey.mockResolvedValue({
      doc: {
        current_version: 3
      },
      version: {
        content: '# COACH_SOUL.md\n\nKeep it grounded.'
      }
    });
    mockGetLatestDocVersionByDocType.mockImplementation(async (_userId, docType) => {
      if (docType === 'PROGRAM') {
        return {
          doc: {
            current_version: 2
          },
          version: {
            content: '# PROGRAM.md\n\n## Summary\n- Train 3 days'
          }
        };
      }

      if (docType === 'MEMORY') {
        return {
          doc: {
            current_version: 5
          },
          version: {
            content: '# MEMORY.md\n\n- Prefers concise coaching'
          }
        };
      }

      return null;
    });
  });

  it('loads bootstrap when the program document is missing', () => {
    expect(shouldLoadBootstrapInstructions(null)).toBe(true);
  });

  it('loads bootstrap when the program document is blank', () => {
    expect(shouldLoadBootstrapInstructions({
      version: {
        content: '   '
      }
    })).toBe(true);
  });

  it('does not load bootstrap when the program document has content', () => {
    expect(shouldLoadBootstrapInstructions({
      version: {
        content: '# PROGRAM.md\n\n## Summary\n- **Primary Goal**: Strength'
      }
    })).toBe(false);
  });

  it('includes current version metadata even when the document is blank', () => {
    expect(buildVersionedDocumentMarkdown({
      doc: {
        current_version: 1
      },
      version: {
        content: '   '
      }
    })).toBe('Current Version: 1\n_not available yet_');
  });

  it('injects versioned coach soul, live workout context, and current time into the prompt', async () => {
    mockGetCurrentWorkoutState.mockResolvedValue({
      workoutSessionId: 'workout-1',
      currentExerciseIndex: 1,
      currentSetIndex: 2,
      exercises: [
        {
          workoutExerciseId: 'exercise-1',
          exerciseName: 'Goblet Squat'
        }
      ]
    });

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'user.message'
    });

    expect(result.systemPrompt).toContain('## Coach Soul');
    expect(result.systemPrompt).toContain('Current Version: 3');
    expect(result.systemPrompt).toContain('## Runtime Context');
    expect(result.systemPrompt).toContain('"workoutSessionId": "workout-1"');
    expect(result.systemPrompt).toContain('### Current Date and Time');
    expect(result.systemPrompt).toContain('Timezone: America/New_York');
    expect(result.metadata.layers.hasCurrentWorkout).toBe(true);
  });

  it('injects the no-active-workout semantic context when there is no live workout', async () => {
    mockGetCurrentWorkoutState.mockResolvedValue(null);

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'user.message'
    });

    expect(result.systemPrompt).toContain('There is no current workout available for this user and active session context.');
    expect(result.systemPrompt).toContain('Suggested tool: workout_generate');
    expect(result.metadata.layers.hasCurrentWorkout).toBe(false);
  });

  it('places the explicit Anthropic breakpoint before the dynamic runtime context', async () => {
    mockGetCurrentWorkoutState.mockResolvedValue({
      workoutSessionId: 'workout-1'
    });

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'user.message'
    });

    const runtimeContextBlock = result.systemBlocks[result.systemBlocks.length - 1];
    const preRuntimeContextBlock = result.systemBlocks[result.systemBlocks.length - 2];

    expect(runtimeContextBlock.text).toContain('## Runtime Context');
    expect(runtimeContextBlock.cache_control).toBeUndefined();
    expect(preRuntimeContextBlock.cache_control).toEqual({
      type: 'ephemeral',
      ttl: '5m'
    });
  });
});
