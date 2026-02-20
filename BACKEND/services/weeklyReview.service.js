const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');
const { getActiveProgram } = require('./trainerProgram.service');
const { getLatestProfile, formatProfileForPrompt } = require('./trainerWeightsProfile.service');
const { calculateWeeklyStats, getCurrentWeekBounds } = require('./statsCalculator.service');
const { regenerateWeeklyCalendar } = require('./trainerCalendar.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PROGRAM_MODEL || process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Get all session summaries from the past week.
 */
async function getWeekSessionSummaries(userId, weekStart, weekEnd) {
  const { data: sessions, error: sessError } = await supabase
    .from('workout_sessions')
    .select('id, started_at, status, summary_json')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', weekStart.toISOString())
    .lte('started_at', weekEnd.toISOString())
    .order('started_at', { ascending: true });

  if (sessError) throw sessError;
  if (!sessions?.length) return [];

  return sessions.map(session => ({
    session_id: session.id,
    date: session.started_at,
    summary: session.summary_json || null
  }));
}

/**
 * AI rewrites the program markdown based on weekly data.
 */
async function rewriteProgram({ currentProgram, weekSummaries, weeklyStats, weightsProfile }) {
  const weightsText = formatProfileForPrompt(weightsProfile);

  const prompt = `You are an expert strength & conditioning coach performing a weekly program review.

CURRENT PROGRAM:
${currentProgram.program_markdown}

THIS WEEK'S SESSION SUMMARIES:
${JSON.stringify(weekSummaries, null, 2)}

WEEKLY STATS:
${JSON.stringify(weeklyStats, null, 2)}

${weightsText ? `CURRENT WEIGHTS PROFILE:\n${weightsText}\n` : ''}

INSTRUCTIONS:
Review the week's training data and update the program. You MUST:
1. Preserve the exact same markdown structure and section headings
2. Keep core goals and safety guardrails unless data strongly suggests changes
3. Update the "# Coach Notes" section with observations from this week
4. Update "# Milestones" — check off any achieved, add new ones if appropriate
5. Evaluate phase transition: should the client stay in the current phase, advance, or deload?
   - If advancing: update "# Current Phase" to the next phase from "# Available Phases"
   - If deloading: update "# Current Phase" to deload parameters
   - If staying: increment the week number in "# Current Phase"
6. Adjust the weekly template if the data suggests changes (e.g., client consistently skipping a day)
7. Update rep ranges, intensity, or volume in "# Current Phase" if warranted

Return ONLY the complete updated program markdown. No code fences, no preamble.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16384,
    system: [{ type: 'text', text: 'You are an expert strength & conditioning coach. Output only markdown.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  let markdown = (textBlock?.text || '').trim();

  // Strip code fences if wrapped
  if (markdown.startsWith('```')) {
    markdown = markdown.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!markdown || !markdown.includes('# ')) {
    throw new Error('Failed to generate updated program markdown');
  }

  return markdown;
}

/**
 * Save a new program version after weekly review.
 */
async function saveNewProgramVersion(userId, newMarkdown) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const nextVersion = (program.version || 0) + 1;

  const { data, error } = await supabase
    .from('trainer_programs')
    .update({
      program_markdown: newMarkdown,
      version: nextVersion,
      updated_at: nowIso()
    })
    .eq('id', program.id)
    .select()
    .single();

  if (error) throw error;

  // Update active program reference
  await supabase
    .from('trainer_active_program')
    .upsert({
      user_id: userId,
      program_id: program.id,
      program_version: nextVersion,
      updated_at: nowIso()
    });

  // Log the event
  await supabase.from('trainer_program_events').insert({
    program_id: program.id,
    event_type: 'weekly_review',
    data: { version: nextVersion, markdown_length: newMarkdown.length }
  });

  return data;
}

/**
 * Run the full weekly review for a user.
 */
async function runWeeklyReview(userId) {
  console.log(`[weekly-review] Starting review for user ${userId}`);
  const t0 = Date.now();

  const { weekStart, weekEnd } = getCurrentWeekBounds();

  // 1. Gather inputs in parallel
  const [weekSummaries, weeklyStats, currentProgram, weightsProfile] = await Promise.all([
    getWeekSessionSummaries(userId, weekStart, weekEnd),
    calculateWeeklyStats(userId, weekStart, weekEnd),
    getActiveProgram(userId),
    getLatestProfile(userId)
  ]);

  console.log(`[weekly-review] Data gathered in ${Date.now() - t0}ms — ${weekSummaries.length} sessions`);

  // 2. Check for inactivity
  if (weekSummaries.length === 0) {
    console.log(`[weekly-review] No sessions this week for user ${userId} — skipping`);
    return { skipped: true, reason: 'no_sessions' };
  }

  if (!currentProgram) {
    console.log(`[weekly-review] No active program for user ${userId} — skipping`);
    return { skipped: true, reason: 'no_active_program' };
  }

  // 3. AI rewrites the program
  const tRewrite = Date.now();
  const newProgramMarkdown = await rewriteProgram({
    currentProgram,
    weekSummaries,
    weeklyStats,
    weightsProfile
  });
  console.log(`[weekly-review] Program rewritten in ${Date.now() - tRewrite}ms`);

  // 4. Save new program version
  await saveNewProgramVersion(userId, newProgramMarkdown);

  // 5. Regenerate next week's calendar
  await regenerateWeeklyCalendar(userId, newProgramMarkdown);

  console.log(`[weekly-review] Complete for user ${userId} in ${Date.now() - t0}ms`);
  return { skipped: false, weeklyStats };
}

/**
 * Get all users with an active program (candidates for weekly review).
 */
async function getActiveUsers() {
  const { data, error } = await supabase
    .from('trainer_active_program')
    .select('user_id');

  if (error) throw error;
  return (data || []).map(row => row.user_id);
}

/**
 * Check if user has upcoming planned events. If not, run a catch-up review.
 */
async function checkAndRunCatchUpReview(userId) {
  const now = new Date();
  const { data: upcomingEvents, error } = await supabase
    .from('trainer_calendar_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', 'workout')
    .in('status', ['scheduled', 'planned'])
    .gte('start_at', now.toISOString())
    .limit(1);

  if (error) throw error;

  if (upcomingEvents && upcomingEvents.length > 0) {
    return { regenerated: false, reason: 'has_upcoming_events' };
  }

  // No upcoming events — user returning from inactivity or needs a refresh
  console.log(`[weekly-review] No upcoming events for user ${userId} — running catch-up review`);

  const program = await getActiveProgram(userId);
  if (!program) {
    return { regenerated: false, reason: 'no_active_program' };
  }

  // Regenerate calendar from current program
  await regenerateWeeklyCalendar(userId, program.program_markdown);

  return { regenerated: true };
}

module.exports = {
  runWeeklyReview,
  getActiveUsers,
  checkAndRunCatchUpReview,
  getWeekSessionSummaries,
  // Exported for testing
  rewriteProgram,
  saveNewProgramVersion
};
