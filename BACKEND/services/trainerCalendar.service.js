const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeEvent(event) {
  const planned = Array.isArray(event.trainer_planned_sessions)
    ? event.trainer_planned_sessions[0]
    : null;
  const { trainer_planned_sessions, ...rest } = event;
  return {
    ...rest,
    planned_session: planned || null
  };
}

async function fetchEventWithPlan(userId, eventId) {
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .select('*, trainer_planned_sessions(id, intent_json)')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return normalizeEvent(data);
}

async function listEvents(userId, start, end) {
  let query = supabase
    .from('trainer_calendar_events')
    .select('*, trainer_planned_sessions(id, intent_json)')
    .eq('user_id', userId)
    .order('start_at', { ascending: true });

  if (start) query = query.gte('start_at', start);
  if (end) query = query.lte('start_at', end);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeEvent);
}

async function getPlannedSession(plannedSessionId, userId = null) {
  let query = supabase
    .from('trainer_planned_sessions')
    .select('*')
    .eq('id', plannedSessionId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

async function createPlannedSession(userId, calendarEventId, intentJson) {
  const { data, error } = await supabase
    .from('trainer_planned_sessions')
    .insert({
      user_id: userId,
      calendar_event_id: calendarEventId,
      intent_json: intentJson
    })
    .select()
    .single();
  if (error) throw error;
  await supabase
    .from('trainer_calendar_events')
    .update({
      linked_planned_session_id: data.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', calendarEventId)
    .eq('user_id', userId);
  return data;
}

async function createEvent(userId, payload) {
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .insert({
      user_id: userId,
      event_type: payload.event_type || 'workout',
      start_at: payload.start_at,
      end_at: payload.end_at || null,
      title: payload.title || null,
      status: payload.status || 'scheduled',
      source: payload.source || 'user_created',
      user_modified: true,
      notes: payload.notes || null
    })
    .select()
    .single();

  if (error) throw error;
  let plannedSession = null;
  if (payload.intent_json && (payload.event_type || 'workout') === 'workout') {
    plannedSession = await createPlannedSession(userId, data.id, payload.intent_json);
  }
  if (plannedSession) {
    return {
      ...data,
      planned_session: plannedSession
    };
  }
  return fetchEventWithPlan(userId, data.id);
}

async function rescheduleEvent(userId, eventId, payload) {
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .update({
      start_at: payload.start_at,
      end_at: payload.end_at || null,
      user_modified: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return fetchEventWithPlan(userId, data.id);
}

async function skipEvent(userId, eventId, reason) {
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .update({
      status: 'skipped',
      notes: reason || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return fetchEventWithPlan(userId, data.id);
}

async function completeEvent(userId, eventId) {
  const { data, error } = await supabase
    .from('trainer_calendar_events')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return fetchEventWithPlan(userId, data.id);
}

async function deleteEvent(userId, eventId, options = {}) {
  const cascadePlanned = Boolean(options.cascadePlanned);
  let linkedPlannedSessionId = null;

  if (cascadePlanned) {
    const { data: existing, error: fetchError } = await supabase
      .from('trainer_calendar_events')
      .select('linked_planned_session_id')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    linkedPlannedSessionId = existing?.linked_planned_session_id || null;
  }

  const { error } = await supabase
    .from('trainer_calendar_events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', userId);
  if (error) throw error;

  if (cascadePlanned && linkedPlannedSessionId) {
    const { error: plannedError } = await supabase
      .from('trainer_planned_sessions')
      .delete()
      .eq('id', linkedPlannedSessionId)
      .eq('user_id', userId);
    if (plannedError && plannedError.code !== 'PGRST116') {
      throw plannedError;
    }
  }
}

/**
 * Parse the "# Training Sessions" section from program markdown.
 * Extracts session day names, duration, and intensity from lines like:
 *   ## Day 1: Upper Body Push
 *   *45 minutes — moderate intensity*
 */
function parseSessionsFromMarkdown(markdown) {
  if (!markdown) return [];

  const sessions = [];
  const lines = markdown.split('\n');
  let inTrainingSessions = false;
  let currentSession = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect Training Sessions section
    if (/^#\s+Training Sessions/i.test(trimmed)) {
      inTrainingSessions = true;
      continue;
    }

    // Stop at the next top-level heading
    if (inTrainingSessions && /^#\s+[^#]/.test(trimmed) && !/Training Sessions/i.test(trimmed)) {
      if (currentSession) sessions.push(currentSession);
      break;
    }

    if (!inTrainingSessions) continue;

    // Match day headings like "## Day 1: Upper Body Push"
    const dayMatch = trimmed.match(/^##\s+Day\s+(\d+):\s*(.+)/i);
    if (dayMatch) {
      if (currentSession) sessions.push(currentSession);
      currentSession = {
        dayNumber: parseInt(dayMatch[1]),
        name: dayMatch[2].trim(),
        durationMin: 45,
        intensity: 'moderate'
      };
      continue;
    }

    // Match duration/intensity line like "*45 minutes — moderate intensity*"
    if (currentSession && /^\*.*minutes.*\*$/.test(trimmed)) {
      const durMatch = trimmed.match(/(\d+)\s*minutes/i);
      if (durMatch) currentSession.durationMin = parseInt(durMatch[1]);
      const intMatch = trimmed.match(/(low|moderate|high)\s*intensity/i);
      if (intMatch) currentSession.intensity = intMatch[1].toLowerCase();
    }
  }

  // Push last session if we hit end of file
  if (currentSession && !sessions.includes(currentSession)) {
    sessions.push(currentSession);
  }

  return sessions;
}

/**
 * Parse days per week from markdown "# Weekly Structure" section.
 * Looks for "**N** days per week" pattern.
 */
function parseDaysPerWeek(markdown) {
  if (!markdown) return 3;
  const match = markdown.match(/\*\*(\d+)\*\*\s*days?\s*per\s*week/i);
  return match ? parseInt(match[1]) : 3;
}

async function syncCalendarFromProgram(userId) {
  const { data: activeProgram, error } = await supabase
    .from('trainer_active_program')
    .select('program_id, program_version')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  if (!activeProgram) {
    return { created: 0, reason: 'no_active_program' };
  }

  const { data: programData, error: programError } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', activeProgram.program_id)
    .single();

  if (programError) throw programError;

  const markdown = programData.program_markdown || '';
  const sessionTemplates = parseSessionsFromMarkdown(markdown);
  const daysPerWeek = parseDaysPerWeek(markdown);
  const safeDaysPerWeek = Math.max(1, Math.min(daysPerWeek, 7));

  const today = startOfDay(new Date());
  const horizonDays = 28;
  const events = [];

  const interval = Math.max(1, Math.floor(7 / safeDaysPerWeek));
  let sessionIndex = 0;

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    if (dayOffset % interval === 0) {
      const date = addDays(today, dayOffset);
      const template = sessionTemplates[sessionIndex % Math.max(sessionTemplates.length, 1)] || {};
      events.push({
        user_id: userId,
        event_type: 'workout',
        start_at: date.toISOString(),
        title: template.name || null,
        status: 'scheduled',
        source: 'program_projection',
        user_modified: false,
        linked_program_id: programData.id,
        linked_program_version: programData.version
      });
      sessionIndex++;
    }
  }

  // Clean up existing future projections
  const { error: cleanupError } = await supabase
    .from('trainer_calendar_events')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'program_projection')
    .eq('user_modified', false)
    .gte('start_at', today.toISOString());

  if (cleanupError) throw cleanupError;

  let createdCount = 0;
  if (events.length) {
    const { data: createdEvents, error: insertError } = await supabase
      .from('trainer_calendar_events')
      .insert(events)
      .select();
    if (insertError) throw insertError;

    for (let idx = 0; idx < createdEvents.length; idx++) {
      const event = createdEvents[idx];
      const template = sessionTemplates[idx % Math.max(sessionTemplates.length, 1)] || {};
      const intent = {
        focus: template.name || 'Workout',
        duration_min: template.durationMin || 45,
        intensity: template.intensity || 'moderate'
      };
      await createPlannedSession(userId, event.id, intent);
    }
    createdCount = createdEvents.length;
  }

  return { created: createdCount };
}

/**
 * Regenerate the next week's calendar from program markdown.
 * Deletes future planned/scheduled events and creates new ones.
 */
async function regenerateWeeklyCalendar(userId, programMarkdown) {
  const sessionTemplates = parseSessionsFromMarkdown(programMarkdown);
  const daysPerWeek = parseDaysPerWeek(programMarkdown);
  const safeDaysPerWeek = Math.max(1, Math.min(daysPerWeek, 7));

  // Get next Monday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = startOfDay(addDays(now, daysUntilMonday));
  const nextSunday = addDays(nextMonday, 6);
  nextSunday.setHours(23, 59, 59, 999);

  // Delete existing future planned events (not completed/user-modified)
  const { error: deleteError } = await supabase
    .from('trainer_calendar_events')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'program_projection')
    .eq('user_modified', false)
    .in('status', ['scheduled', 'planned'])
    .gte('start_at', nextMonday.toISOString());

  if (deleteError) throw deleteError;

  // Create next week's events from template
  const events = [];
  const interval = Math.max(1, Math.floor(7 / safeDaysPerWeek));

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    if (dayOffset % interval === 0 && events.length < safeDaysPerWeek) {
      const date = addDays(nextMonday, dayOffset);
      const template = sessionTemplates[events.length % Math.max(sessionTemplates.length, 1)] || {};
      events.push({
        user_id: userId,
        event_type: 'workout',
        start_at: date.toISOString(),
        title: template.name || 'Workout',
        status: 'scheduled',
        source: 'program_projection',
        user_modified: false
      });
    }
  }

  if (!events.length) {
    return { created: 0 };
  }

  const { data: createdEvents, error: insertError } = await supabase
    .from('trainer_calendar_events')
    .insert(events)
    .select();

  if (insertError) throw insertError;

  // Create planned sessions for each event
  for (let idx = 0; idx < createdEvents.length; idx++) {
    const event = createdEvents[idx];
    const template = sessionTemplates[idx % Math.max(sessionTemplates.length, 1)] || {};
    const intent = {
      focus: template.name || 'Workout',
      duration_min: template.durationMin || 45,
      intensity: template.intensity || 'moderate'
    };
    await createPlannedSession(userId, event.id, intent);
  }

  console.log(`[calendar] Regenerated ${createdEvents.length} events for next week`);
  return { created: createdEvents.length };
}

module.exports = {
  listEvents,
  fetchEventWithPlan,
  getPlannedSession,
  createPlannedSession,
  createEvent,
  rescheduleEvent,
  skipEvent,
  completeEvent,
  deleteEvent,
  syncCalendarFromProgram,
  regenerateWeeklyCalendar,
  parseSessionsFromMarkdown,
  parseDaysPerWeek,
  // Exported for testing
  normalizeEvent
};
