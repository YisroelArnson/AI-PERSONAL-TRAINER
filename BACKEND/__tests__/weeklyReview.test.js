jest.mock('@supabase/supabase-js', () => {
  const { buildSupabaseMock } = require('./helpers/supabaseMock');
  return buildSupabaseMock();
});

jest.mock('../services/modelProviders.service', () => ({
  getAnthropicClient: jest.fn()
}));

jest.mock('../services/trainerProgram.service', () => ({
  getActiveProgram: jest.fn()
}));

jest.mock('../services/trainerWeightsProfile.service', () => ({
  getLatestProfile: jest.fn(),
  formatProfileForPrompt: jest.fn()
}));

jest.mock('../services/statsCalculator.service', () => ({
  calculateWeeklyStats: jest.fn(),
  getCurrentWeekBounds: jest.fn()
}));

jest.mock('../services/trainerCalendar.service', () => ({
  regenerateWeeklyCalendar: jest.fn()
}));

const { __mockChain: mockChain } = require('@supabase/supabase-js');
const { getAnthropicClient } = require('../services/modelProviders.service');
const { getActiveProgram } = require('../services/trainerProgram.service');
const { getLatestProfile, formatProfileForPrompt } = require('../services/trainerWeightsProfile.service');
const { calculateWeeklyStats, getCurrentWeekBounds } = require('../services/statsCalculator.service');
const { regenerateWeeklyCalendar } = require('../services/trainerCalendar.service');

const {
  rewriteProgram,
  getWeekSessionSummaries,
  saveNewProgramVersion,
  runWeeklyReview,
  getActiveUsers,
  checkAndRunCatchUpReview
} = require('../services/weeklyReview.service');

const { sampleProgramMarkdown } = require('./fixtures/programMarkdown');
const { sampleWeightsProfile } = require('./fixtures/weightsProfile');

// ─── Helpers ─────────────────────────────────────────────────────────

const mockCreate = jest.fn();

beforeEach(() => {
  mockChain.reset();
  mockCreate.mockReset();
  getAnthropicClient.mockReturnValue({ messages: { create: mockCreate } });
  getActiveProgram.mockReset();
  getLatestProfile.mockReset();
  formatProfileForPrompt.mockReset();
  calculateWeeklyStats.mockReset();
  getCurrentWeekBounds.mockReset();
  regenerateWeeklyCalendar.mockReset();
});

// ─── rewriteProgram ──────────────────────────────────────────────────

describe('rewriteProgram', () => {
  const validInput = {
    currentProgram: { program_markdown: sampleProgramMarkdown },
    weekSummaries: [{ session_id: 's1', date: '2026-02-16', summary: { title: 'Good workout' } }],
    weeklyStats: { sessions_completed: 3, total_volume: 5000 },
    weightsProfile: sampleWeightsProfile
  };

  it('returns markdown from AI response', async () => {
    formatProfileForPrompt.mockReturnValue('- dumbbell bench: 25 lbs');
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '# Updated Program\n## Section\nContent here' }]
    });

    const result = await rewriteProgram(validInput);
    expect(result).toContain('# Updated Program');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('strips code fences from response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```markdown\n# Program\n## Section\nContent\n```' }]
    });

    const result = await rewriteProgram(validInput);
    expect(result).not.toContain('```');
    expect(result).toContain('# Program');
  });

  it('throws when AI returns empty response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }]
    });

    await expect(rewriteProgram(validInput)).rejects.toThrow('Failed to generate updated program markdown');
  });

  it('throws when response has no markdown headings', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Just some text without headings' }]
    });

    await expect(rewriteProgram(validInput)).rejects.toThrow('Failed to generate updated program markdown');
  });
});

// ─── getWeekSessionSummaries ─────────────────────────────────────────

describe('getWeekSessionSummaries', () => {
  const weekStart = new Date('2026-02-09T00:00:00Z');
  const weekEnd = new Date('2026-02-15T23:59:59Z');

  it('returns empty array when no sessions', async () => {
    mockChain.mockTable('workout_sessions', []);
    const result = await getWeekSessionSummaries('user-1', weekStart, weekEnd);
    expect(result).toEqual([]);
  });

  it('queries the correct table', async () => {
    mockChain.mockTable('workout_sessions', []);
    await getWeekSessionSummaries('user-1', weekStart, weekEnd);
    expect(mockChain.from).toHaveBeenCalledWith('workout_sessions');
  });

  it('throws on Supabase error', async () => {
    mockChain.mockTable('workout_sessions', null, { message: 'DB error' });
    await expect(getWeekSessionSummaries('user-1', weekStart, weekEnd)).rejects.toEqual({ message: 'DB error' });
  });
});

// ─── getActiveUsers ──────────────────────────────────────────────────

describe('getActiveUsers', () => {
  it('returns user IDs', async () => {
    mockChain.mockResolve([{ user_id: 'u1' }, { user_id: 'u2' }]);
    const result = await getActiveUsers();
    expect(result).toEqual(['u1', 'u2']);
  });

  it('returns empty array when no active programs', async () => {
    mockChain.mockResolve([]);
    const result = await getActiveUsers();
    expect(result).toEqual([]);
  });
});

// ─── runWeeklyReview ─────────────────────────────────────────────────

describe('runWeeklyReview', () => {
  const weekStart = new Date('2026-02-09T00:00:00Z');
  const weekEnd = new Date('2026-02-15T23:59:59Z');

  beforeEach(() => {
    getCurrentWeekBounds.mockReturnValue({ weekStart, weekEnd });
    // Default: no sessions from Supabase
    mockChain.mockTable('workout_sessions', []);
  });

  it('skips when no sessions this week', async () => {
    getActiveProgram.mockResolvedValue({ id: 'p1', program_markdown: sampleProgramMarkdown });
    getLatestProfile.mockResolvedValue(sampleWeightsProfile);
    calculateWeeklyStats.mockResolvedValue({ sessions_completed: 0 });

    const result = await runWeeklyReview('user-1');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_sessions');
  });

  it('skips when no active program', async () => {
    // Need sessions for it to get past the sessions check
    mockChain.mockTable('workout_sessions', [
      { id: 's1', started_at: '2026-02-16T10:00:00Z', status: 'completed', summary_json: {} }
    ]);
    getActiveProgram.mockResolvedValue(null);
    getLatestProfile.mockResolvedValue(null);
    calculateWeeklyStats.mockResolvedValue({ sessions_completed: 1 });

    const result = await runWeeklyReview('user-1');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_active_program');
  });
});

// ─── checkAndRunCatchUpReview ────────────────────────────────────────

describe('checkAndRunCatchUpReview', () => {
  it('returns false when user has upcoming events', async () => {
    mockChain.mockResolve([{ id: 'evt-1' }]);
    const result = await checkAndRunCatchUpReview('user-1');
    expect(result.regenerated).toBe(false);
    expect(result.reason).toBe('has_upcoming_events');
  });

  it('returns false when no active program and no events', async () => {
    mockChain.mockResolve([]);
    getActiveProgram.mockResolvedValue(null);
    const result = await checkAndRunCatchUpReview('user-1');
    expect(result.regenerated).toBe(false);
    expect(result.reason).toBe('no_active_program');
  });

  it('regenerates calendar when no upcoming events and has program', async () => {
    mockChain.mockResolve([]);
    getActiveProgram.mockResolvedValue({ id: 'p1', program_markdown: sampleProgramMarkdown });
    regenerateWeeklyCalendar.mockResolvedValue({ created: 3 });

    const result = await checkAndRunCatchUpReview('user-1');
    expect(result.regenerated).toBe(true);
    expect(regenerateWeeklyCalendar).toHaveBeenCalledWith('user-1', sampleProgramMarkdown);
  });
});
