jest.mock('@supabase/supabase-js', () => {
  const { buildSupabaseMock } = require('./helpers/supabaseMock');
  return buildSupabaseMock();
});

const {
  normalizeEvent,
  parseSessionsFromMarkdown,
  parseDaysPerWeek
} = require('../services/trainerCalendar.service');

const { sampleProgramMarkdown, minimalProgramMarkdown } = require('./fixtures/programMarkdown');

// ─── normalizeEvent ──────────────────────────────────────────────────

describe('normalizeEvent', () => {
  it('extracts first planned session from array', () => {
    const event = {
      id: 'evt-1',
      event_type: 'workout',
      trainer_planned_sessions: [{ id: 'ps-1', intent_json: { focus: 'Upper' } }]
    };
    const result = normalizeEvent(event);
    expect(result.planned_session).toEqual({ id: 'ps-1', intent_json: { focus: 'Upper' } });
    expect(result.trainer_planned_sessions).toBeUndefined();
  });

  it('returns null planned_session for empty array', () => {
    const event = { id: 'evt-2', trainer_planned_sessions: [] };
    const result = normalizeEvent(event);
    expect(result.planned_session).toBe(null);
  });

  it('returns null planned_session when field is not an array', () => {
    const event = { id: 'evt-3', trainer_planned_sessions: null };
    const result = normalizeEvent(event);
    expect(result.planned_session).toBe(null);
  });

  it('preserves all other event fields', () => {
    const event = {
      id: 'evt-4',
      event_type: 'workout',
      start_at: '2026-02-16T09:00:00Z',
      status: 'scheduled',
      trainer_planned_sessions: [{ id: 'ps-1', intent_json: {} }]
    };
    const result = normalizeEvent(event);
    expect(result.id).toBe('evt-4');
    expect(result.event_type).toBe('workout');
    expect(result.start_at).toBe('2026-02-16T09:00:00Z');
    expect(result.status).toBe('scheduled');
  });
});

// ─── parseSessionsFromMarkdown ───────────────────────────────────────

describe('parseSessionsFromMarkdown', () => {
  it('parses 3 sessions from sample program', () => {
    const sessions = parseSessionsFromMarkdown(sampleProgramMarkdown);
    expect(sessions).toHaveLength(3);
  });

  it('extracts day number, name, duration, and intensity', () => {
    const sessions = parseSessionsFromMarkdown(sampleProgramMarkdown);
    expect(sessions[0]).toEqual({
      dayNumber: 1,
      name: 'Upper Body Push',
      durationMin: 45,
      intensity: 'moderate'
    });
    expect(sessions[1]).toEqual({
      dayNumber: 2,
      name: 'Lower Body',
      durationMin: 60,
      intensity: 'high'
    });
    expect(sessions[2]).toEqual({
      dayNumber: 3,
      name: 'Upper Body Pull',
      durationMin: 45,
      intensity: 'moderate'
    });
  });

  it('parses minimal program with 1 session', () => {
    const sessions = parseSessionsFromMarkdown(minimalProgramMarkdown);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('Full Body');
    expect(sessions[0].durationMin).toBe(30);
    expect(sessions[0].intensity).toBe('low');
  });

  it('returns empty array for null input', () => {
    expect(parseSessionsFromMarkdown(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSessionsFromMarkdown('')).toEqual([]);
  });

  it('returns empty array for markdown without Training Sessions section', () => {
    const md = '# My Program\nSome text\n# Weekly Structure\nMore text';
    expect(parseSessionsFromMarkdown(md)).toEqual([]);
  });

  it('defaults to 45 min and moderate when not specified', () => {
    const md = '# Training Sessions\n## Day 1: Arms\nSome description text.';
    const sessions = parseSessionsFromMarkdown(md);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMin).toBe(45);
    expect(sessions[0].intensity).toBe('moderate');
  });
});

// ─── parseDaysPerWeek ────────────────────────────────────────────────

describe('parseDaysPerWeek', () => {
  it('extracts days per week from sample program', () => {
    expect(parseDaysPerWeek(sampleProgramMarkdown)).toBe(3);
  });

  it('extracts 5 from minimal program', () => {
    expect(parseDaysPerWeek(minimalProgramMarkdown)).toBe(5);
  });

  it('defaults to 3 for null input', () => {
    expect(parseDaysPerWeek(null)).toBe(3);
  });

  it('defaults to 3 when pattern not found', () => {
    expect(parseDaysPerWeek('# Some markdown without the pattern')).toBe(3);
  });

  it('handles singular "day"', () => {
    expect(parseDaysPerWeek('train **1** day per week')).toBe(1);
  });
});
