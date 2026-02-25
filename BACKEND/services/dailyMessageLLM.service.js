const { z } = require('zod');

const DEFAULT_DAILY_MESSAGE_MODEL = process.env.DAILY_MESSAGE_MODEL || 'claude-haiku-4-5';

const dailyMessageLlmContextSchema = z.object({
  profile_snapshot: z.object({
    first_name: z.string().trim().min(1).nullable().optional(),
    goals_summary: z.string().trim().min(1).nullable().optional(),
    coaching_style: z.string().trim().min(1).nullable().optional(),
    equipment_summary: z.array(z.string().trim().min(1)).max(30).optional(),
    primary_location_name: z.string().trim().min(1).nullable().optional()
  }).strict(),

  today_context: z.object({
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_zone: z.string().trim().min(1),
    day_of_week: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    planned_workout_today: z.object({
      exists: z.boolean(),
      title: z.string().trim().min(1).nullable().optional(),
      focus: z.string().trim().min(1).nullable().optional(),
      duration_min: z.number().int().min(1).max(360).nullable().optional(),
      notes: z.string().trim().min(1).nullable().optional()
    }).strict(),
    next_scheduled_workout: z.object({
      start_at: z.string().trim().min(1).nullable().optional(),
      title: z.string().trim().min(1).nullable().optional(),
      focus: z.string().trim().min(1).nullable().optional(),
      duration_min: z.number().int().min(1).max(360).nullable().optional()
    }).strict().nullable().optional()
  }).strict(),

  recent_adherence: z.object({
    workouts_completed_week: z.number().int().min(0),
    workouts_planned_week: z.number().int().min(0),
    adherence_rate_pct: z.number().min(0).max(100).nullable().optional(),
    streak_days: z.number().int().min(0),
    skipped_last_7d: z.number().int().min(0)
  }).strict(),

  performance_trends: z.object({
    volume_30d_delta_pct: z.number().nullable().optional(),
    session_count_30d_delta_pct: z.number().nullable().optional(),
    avg_duration_30d_delta_min: z.number().nullable().optional(),
    avg_rpe_30d_delta: z.number().nullable().optional(),
    split_volume_delta_pct: z.object({
      push: z.number().nullable().optional(),
      pull: z.number().nullable().optional(),
      lower: z.number().nullable().optional()
    }).strict().optional()
  }).strict(),

  last_session_summary: z.object({
    started_at: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    focus: z.string().trim().min(1).nullable().optional(),
    wins: z.array(z.string().trim().min(1)).max(3).optional(),
    pain_flags_count: z.number().int().min(0).nullable().optional(),
    completion_quality: z.enum(['completed', 'stopped_early', 'partial', 'unknown']),
    unfinished_sets_total: z.number().int().min(0).nullable().optional()
  }).strict(),

  progress_signals: z.object({
    measurement_changes: z.array(z.object({
      metric: z.string().trim().min(1),
      delta_text: z.string().trim().min(1),
      measured_at: z.string().trim().min(1).nullable().optional()
    }).strict()).max(5).optional(),
    prs: z.array(z.object({
      label: z.string().trim().min(1),
      value_text: z.string().trim().min(1),
      achieved_at: z.string().trim().min(1).nullable().optional()
    }).strict()).max(5).optional()
  }).strict(),

  continuity_memory: z.object({
    stable_facts: z.array(z.string().trim().min(1)).max(8).optional(),
    sentiment_cue: z.string().trim().min(1).nullable().optional()
  }).strict(),

  program_phase_context: z.object({
    phase_name: z.string().trim().min(1).nullable().optional(),
    phase_week: z.number().int().min(1).nullable().optional(),
    weekly_focus: z.string().trim().min(1).nullable().optional(),
    recovery_flag: z.enum(['normal', 'deload', 'overreach', 'unknown']).nullable().optional()
  }).strict().optional(),

  safety_and_recovery: z.object({
    soreness_trend: z.enum(['improving', 'stable', 'worsening', 'unknown']).nullable().optional(),
    pain_trend: z.enum(['improving', 'stable', 'worsening', 'unknown']).nullable().optional(),
    days_since_last_workout: z.number().int().min(0).nullable().optional()
  }).strict().optional(),

  engagement_context: z.object({
    days_since_last_open: z.number().int().min(0).nullable().optional(),
    days_since_last_workout_start: z.number().int().min(0).nullable().optional(),
    returning_after_gap: z.boolean().optional()
  }).strict().optional()
}).strict();

const dailyMessageLlmResponseSchema = z.object({
  message_text: z.string().trim().min(1).max(500),
  highlights: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
  suggested_action: z.string().trim().min(1).max(140).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional()
}).strict();

const DAILY_MESSAGE_SYSTEM_PROMPT = [
  'You are a personal trainer writing a short daily home-screen message.',
  'Be specific, grounded in provided data, and emotionally intelligent without hype.',
  '',
  'Hard rules:',
  '1) Use only numbers and facts from the provided context.',
  '2) Do not invent stats, PRs, trends, dates, or events.',
  '3) Keep output concise: 2-4 sentences total.',
  '4) Include at most two inline highlights using **double asterisks**.',
  '5) End with one concrete action for today.',
  '6) If data is sparse, acknowledge briefly and pivot to the best available signal.',
  '7) Do not mention internal field names or JSON.',
  '',
  'Return JSON only in this shape:',
  '{',
  '  "message_text": "string",',
  '  "highlights": ["optional", "max 2"],',
  '  "suggested_action": "optional short action",',
  '  "confidence": "high|medium|low"',
  '}'
].join('\n');

function buildDailyMessageUserPrompt(context) {
  const parsed = dailyMessageLlmContextSchema.parse(context);
  return [
    'Generate a daily message for this user.',
    '',
    'Context JSON:',
    JSON.stringify(parsed, null, 2),
    '',
    'Reminder:',
    '- Keep the message useful and personalized.',
    '- Reference current context (today/next workout, streak/adherence, trend or recent win).',
    '- Keep tone coach-like and practical.'
  ].join('\n');
}

function buildDailyMessageLlmRequest(context) {
  return {
    model: DEFAULT_DAILY_MESSAGE_MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: DAILY_MESSAGE_SYSTEM_PROMPT }],
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: buildDailyMessageUserPrompt(context) }]
    }]
  };
}

function parseDailyMessageResponseText(text) {
  const raw = String(text || '').trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Daily message model response did not contain valid JSON object.');
  }
  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  return dailyMessageLlmResponseSchema.parse(parsed);
}

module.exports = {
  DEFAULT_DAILY_MESSAGE_MODEL,
  DAILY_MESSAGE_SYSTEM_PROMPT,
  dailyMessageLlmContextSchema,
  dailyMessageLlmResponseSchema,
  buildDailyMessageUserPrompt,
  buildDailyMessageLlmRequest,
  parseDailyMessageResponseText
};
