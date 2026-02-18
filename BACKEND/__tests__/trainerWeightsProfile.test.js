jest.mock('@supabase/supabase-js', () => {
  const { buildSupabaseMock } = require('./helpers/supabaseMock');
  return buildSupabaseMock();
});

const { __mockChain: mockChain } = require('@supabase/supabase-js');

const {
  extractJson,
  formatProfileForPrompt,
  getNextVersion,
  getLatestProfile
} = require('../services/trainerWeightsProfile.service');

const { sampleWeightsProfile, emptyWeightsProfile } = require('./fixtures/weightsProfile');

beforeEach(() => {
  mockChain.reset();
});

// ─── extractJson ─────────────────────────────────────────────────────

describe('extractJson', () => {
  it('parses clean JSON', () => {
    const result = extractJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('extracts JSON from surrounding text', () => {
    const result = extractJson('Here is the result: {"entries": [1,2,3]} done.');
    expect(result).toEqual({ entries: [1, 2, 3] });
  });

  it('returns null for null input', () => {
    expect(extractJson(null)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(extractJson('')).toBe(null);
  });

  it('returns null for text without braces', () => {
    expect(extractJson('no json here')).toBe(null);
  });

  it('returns null for invalid JSON', () => {
    expect(extractJson('{not: valid json}')).toBe(null);
  });
});

// ─── formatProfileForPrompt ──────────────────────────────────────────

describe('formatProfileForPrompt', () => {
  it('formats entries as readable lines', () => {
    const result = formatProfileForPrompt(sampleWeightsProfile);
    expect(result).toContain('dumbbell bench press: 25 lbs (confidence: moderate)');
    expect(result).toContain('barbell squat: 135 lbs (confidence: high)');
    expect(result).toContain('bodyweight pull-up: 0 lbs (confidence: moderate)');
  });

  it('returns null for null record', () => {
    expect(formatProfileForPrompt(null)).toBe(null);
  });

  it('returns null for record without profile_json', () => {
    expect(formatProfileForPrompt({ id: 'x' })).toBe(null);
  });

  it('returns null for empty entries array', () => {
    expect(formatProfileForPrompt(emptyWeightsProfile)).toBe(null);
  });

  it('handles entries without equipment field', () => {
    const record = {
      profile_json: [
        { movement: 'push-up', load: 0, load_unit: 'lbs', confidence: 'high' }
      ]
    };
    const result = formatProfileForPrompt(record);
    expect(result).toBe('- push-up: 0 lbs (confidence: high)');
  });
});

// ─── getNextVersion (DB) ─────────────────────────────────────────────

describe('getNextVersion', () => {
  it('returns 1 when no profile exists', async () => {
    mockChain._data = null;
    const version = await getNextVersion('user-1');
    expect(version).toBe(1);
  });

  it('returns latest version + 1', async () => {
    mockChain._data = { version: 5 };
    const version = await getNextVersion('user-1');
    expect(version).toBe(6);
  });
});

// ─── getLatestProfile (DB) ───────────────────────────────────────────

describe('getLatestProfile', () => {
  it('returns profile data', async () => {
    mockChain._data = sampleWeightsProfile;
    const result = await getLatestProfile('user-1');
    expect(result).toEqual(sampleWeightsProfile);
    expect(mockChain.from).toHaveBeenCalledWith('trainer_weights_profiles');
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('returns null when no profile exists', async () => {
    mockChain._data = null;
    const result = await getLatestProfile('user-1');
    expect(result).toBe(null);
  });

  it('throws on Supabase error', async () => {
    mockChain._error = { message: 'DB error' };
    await expect(getLatestProfile('user-1')).rejects.toEqual({ message: 'DB error' });
  });
});
