const crypto = require('crypto');
const dotenv = require('dotenv');
const { z } = require('zod');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const DEFAULT_SCHEDULE_MODEL = process.env.SCHEDULE_EXTRACTOR_MODEL || process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

const WEEKDAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_ALIASES = {
  MONDAY: 'MON',
  MON: 'MON',
  TUESDAY: 'TUE',
  TUES: 'TUE',
  TUE: 'TUE',
  WEDNESDAY: 'WED',
  WED: 'WED',
  THURSDAY: 'THU',
  THURS: 'THU',
  THU: 'THU',
  FRIDAY: 'FRI',
  FRI: 'FRI',
  SATURDAY: 'SAT',
  SAT: 'SAT',
  SUNDAY: 'SUN',
  SUN: 'SUN'
};

const INTENSITY_ALIASES = {
  LOW: 'low',
  LIGHT: 'low',
  EASY: 'low',
  MODERATE: 'moderate',
  MEDIUM: 'moderate',
  MODERATEHARD: 'moderate',
  HARD: 'high',
  HIGH: 'high',
  INTENSE: 'high'
};

const scheduleExtractionSchema = z.object({
  days_per_week: z.union([z.number(), z.string()]).optional(),
  sessions: z.array(z.object({}).passthrough()).min(1),
  rest_day_guidance: z.string().optional().nullable()
});

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function extractJson(text) {
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  const jsonString = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return null;
  }
}

function normalizeWeekday(value) {
  const raw = cleanText(value).toUpperCase().replace(/[^A-Z]/g, '');
  if (!raw) return null;
  const direct = WEEKDAY_ALIASES[raw];
  if (direct) return direct;
  if (raw.length >= 3) {
    const firstThree = raw.slice(0, 3);
    return WEEKDAY_ALIASES[firstThree] || null;
  }
  return null;
}

function normalizeIntensity(value) {
  const raw = cleanText(value).toUpperCase().replace(/[^A-Z]/g, '');
  if (!raw) return 'moderate';
  return INTENSITY_ALIASES[raw] || 'moderate';
}

function normalizeSession(raw, index) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const fallbackName = `Session ${index + 1}`;
  const sessionName = cleanText(
    input.name || input.label || input.title || input.focus || input.session || input.day_title,
    fallbackName
  );
  const rawDayNumber = toInt(input.day_number || input.day || input.index);
  const dayNumber = clampInt(rawDayNumber || (index + 1), 1, 7);
  const durationMin = clampInt(toInt(input.duration_min || input.duration || input.minutes) || 45, 10, 120);
  const intensity = normalizeIntensity(input.intensity);
  const weekday = normalizeWeekday(input.weekday || input.day_name || input.weekday_name || input.preferred_day);
  const notes = cleanText(
    input.notes || input.description || input.summary || input.session_notes,
    ''
  ) || null;

  return {
    day_number: dayNumber,
    name: sessionName,
    duration_min: durationMin,
    intensity,
    weekday,
    notes
  };
}

function normalizeScheduleJson(rawSchedule) {
  const parsed = scheduleExtractionSchema.parse(rawSchedule || {});
  const normalizedSessions = parsed.sessions.map(normalizeSession);
  normalizedSessions.sort((a, b) => a.day_number - b.day_number);

  // Keep stable ordering by day_number while removing duplicates.
  const uniqueSessions = [];
  const usedDayNumbers = new Set();
  for (const session of normalizedSessions) {
    if (usedDayNumbers.has(session.day_number)) continue;
    usedDayNumbers.add(session.day_number);
    uniqueSessions.push(session);
  }

  const inferredDays = uniqueSessions.length;
  const requestedDays = toInt(parsed.days_per_week);
  const daysPerWeek = clampInt(Math.max(requestedDays || inferredDays, inferredDays), 1, 7);

  return {
    schema_version: 1,
    days_per_week: daysPerWeek,
    sessions: uniqueSessions.slice(0, 7),
    rest_day_guidance: cleanText(parsed.rest_day_guidance || null, '') || null
  };
}

function getProgramMarkdownHash(markdown) {
  return crypto
    .createHash('sha256')
    .update(String(markdown || ''), 'utf8')
    .digest('hex');
}

function isFreshProgramSchedule(programRow) {
  if (!programRow || !programRow.program_markdown) return false;
  if (!programRow.schedule_json || !programRow.schedule_source_markdown_hash) return false;
  return programRow.schedule_source_markdown_hash === getProgramMarkdownHash(programRow.program_markdown);
}

async function extractScheduleFromMarkdown(markdown, options = {}) {
  const safeMarkdown = String(markdown || '').trim();
  if (!safeMarkdown) {
    throw new Error('Program markdown is empty; cannot extract schedule.');
  }

  const model = options.model || DEFAULT_SCHEDULE_MODEL;
  const maxAttempts = clampInt(toInt(options.maxAttempts) || 2, 1, 4);
  const prompt = `Extract a deterministic weekly training schedule from this program markdown.

Return JSON only in this exact shape:
{
  "days_per_week": 3,
  "sessions": [
    {
      "day_number": 1,
      "name": "Push Emphasis",
      "duration_min": 40,
      "intensity": "moderate",
      "weekday": "MON",
      "notes": "Progressive chest and shoulder development with compound pressing movements."
    }
  ],
  "rest_day_guidance": "optional text"
}

Rules:
- sessions length must be >= 1 and <= 7
- day_number must be 1..7
- duration_min must be integer minutes
- intensity must be one of: low, moderate, high
- weekday must be one of: MON,TUE,WED,THU,FRI,SAT,SUN or null when unspecified
- notes should be a concise 1 sentence summary for that session (optional when unavailable)
- If the markdown only implies sequence (Day 1/2/3) without explicit weekdays, set weekday to null
- Use the session titles from the markdown as "name" values

Program markdown:
${safeMarkdown}`;

  const client = getAnthropicClient();
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: [{ type: 'text', text: 'You extract workout schedule data from markdown. Return JSON only.' }],
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      });

      const textBlock = response.content.find(block => block.type === 'text');
      const parsed = extractJson((textBlock && textBlock.text) || '');
      if (!parsed) {
        throw new Error('Extractor response did not contain valid JSON.');
      }

      const scheduleJson = normalizeScheduleJson(parsed);
      return {
        schedule_json: scheduleJson,
        schedule_extracted_at: nowIso(),
        schedule_extractor_model: model,
        schedule_source_markdown_hash: getProgramMarkdownHash(safeMarkdown)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to extract a valid schedule from program markdown. ${lastError ? lastError.message : ''}`.trim());
}

function buildCalendarTemplatesFromSchedule(scheduleJson) {
  if (!scheduleJson) {
    return { daysPerWeek: 0, sessions: [] };
  }

  try {
    const normalized = normalizeScheduleJson(scheduleJson);
    return {
      daysPerWeek: normalized.days_per_week,
      sessions: normalized.sessions.map(session => ({
        dayNumber: session.day_number,
        name: session.name,
        durationMin: session.duration_min,
        intensity: session.intensity,
        weekday: session.weekday || null,
        notes: session.notes || null
      }))
    };
  } catch (error) {
    return { daysPerWeek: 0, sessions: [] };
  }
}

module.exports = {
  WEEKDAY_ORDER,
  getProgramMarkdownHash,
  isFreshProgramSchedule,
  normalizeScheduleJson,
  extractScheduleFromMarkdown,
  buildCalendarTemplatesFromSchedule
};
