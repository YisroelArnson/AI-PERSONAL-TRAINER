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
    env.anthropicConversationCacheTtl = '5m';
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

  it('keeps live workout context and current time in the current user turn instead of the system prompt', async () => {
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
    expect(result.systemPrompt).not.toContain('## Runtime Context');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content[0].text).toContain('## Turn Context');
    expect(result.messages[0].content[0].text).toContain('## Runtime Context');
    expect(result.messages[0].content[0].text).toContain('"workoutSessionId": "workout-1"');
    expect(result.messages[0].content[0].text).toContain('### Current Date and Time');
    expect(result.messages[0].content[0].text).toContain('Timezone: America/New_York');
    expect(result.messages[0].content[1]).toEqual({
      type: 'text',
      text: 'What should I do today?'
    });
    expect(result.metadata.layers.hasCurrentWorkout).toBe(true);
  });

  it('injects the no-active-workout semantic context into the current user turn', async () => {
    mockGetCurrentWorkoutState.mockResolvedValue(null);

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'user.message'
    });

    expect(result.systemPrompt).not.toContain('There is no current workout available for this user and active session context.');
    expect(result.messages[0].content[0].text).toContain('There is no current workout available for this user and active session context.');
    expect(result.messages[0].content[0].text).toContain('Suggested tool: workout_generate');
    expect(result.metadata.layers.hasCurrentWorkout).toBe(false);
  });

  it('places explicit Anthropic breakpoints on the last stable system block and last historical message', async () => {
    mockGetPromptContextForRun.mockResolvedValue({
      messages: [
        {
          role: 'user',
          content: 'First question'
        },
        {
          role: 'assistant',
          content: 'First answer'
        },
        {
          role: 'user',
          content: 'What should I do today?'
        }
      ],
      cacheHit: false,
      sourceEventIds: ['event-1', 'event-2', 'event-3']
    });

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'user.message'
    });

    const lastSystemBlock = result.systemBlocks[result.systemBlocks.length - 1];
    const lastHistoricalMessage = result.messages[result.messages.length - 2];
    const currentUserMessage = result.messages[result.messages.length - 1];

    expect(lastSystemBlock.cache_control).toEqual({
      type: 'ephemeral',
      ttl: '5m'
    });
    expect(lastHistoricalMessage.role).toBe('assistant');
    expect(lastHistoricalMessage.content.at(-1).cache_control).toEqual({
      type: 'ephemeral',
      ttl: '5m'
    });
    expect(currentUserMessage.content[0].text).toContain('## Turn Context');
    expect(currentUserMessage.content[0].cache_control).toBeUndefined();
    expect(currentUserMessage.content[1]).toEqual({
      type: 'text',
      text: 'What should I do today?'
    });
  });

  it('adds trigger-specific turn context to the current user message', async () => {
    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'ui.action.complete_set'
    });

    expect(result.systemPrompt).not.toContain('Workout UI Action Context');
    expect(result.messages[0].content[0].text).toContain('## Workout UI Action Context');
    expect(result.messages[0].content[0].text).toContain('reply exactly: no_reply');
  });

  it('creates a synthetic user turn when there is no transcript message', async () => {
    mockGetPromptContextForRun.mockResolvedValue({
      messages: [],
      cacheHit: false,
      sourceEventIds: []
    });

    const result = await assemblePrompt({
      user_id: 'user-123',
      session_key: 'user:123:main',
      trigger_type: 'app.opened'
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: expect.stringContaining('## App Open Context')
          }
        ]
      }
    ]);
    expect(result.systemBlocks[result.systemBlocks.length - 1].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '5m'
    });
  });
});
