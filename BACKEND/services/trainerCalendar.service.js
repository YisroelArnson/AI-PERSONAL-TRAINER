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

  const template = programData.program_json?.weekly_template;
  const daysPerWeek = template?.days_per_week || 3;
  const safeDaysPerWeek = Math.max(1, Math.min(daysPerWeek, 7));
  const preferredDays = template?.preferred_days || [];
  const sessionTemplates = programData.program_json?.sessions || [];

  const today = startOfDay(new Date());
  const horizonDays = 28;
  const events = [];

  const preferredLookup = preferredDays.map(day => day.toLowerCase());
  const shouldScheduleOnDate = (date, offsetIndex) => {
    if (preferredLookup.length) {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      return preferredLookup.includes(dayName);
    }
    const interval = Math.max(1, Math.floor(7 / safeDaysPerWeek));
    return offsetIndex % interval === 0;
  };

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    const date = addDays(today, dayOffset);
    if (shouldScheduleOnDate(date, dayOffset)) {
      events.push({
        user_id: userId,
        event_type: 'workout',
        start_at: date.toISOString(),
        title: null,
        status: 'scheduled',
        source: 'program_projection',
        user_modified: false,
        linked_program_id: programData.id,
        linked_program_version: programData.version
      });
    }
  }

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
      const sessionTemplate = sessionTemplates[idx % Math.max(sessionTemplates.length, 1)] || {};
      const intent = {
        focus: sessionTemplate.focus || 'Workout',
        duration_min: sessionTemplate.duration_min || 45,
        equipment: sessionTemplate.equipment || [],
        notes: sessionTemplate.notes || '',
        session_type: (template?.session_types || [])[idx % Math.max(template?.session_types?.length || 1, 1)] || null,
        time_variants: programData.program_json?.progression?.time_scaling || []
      };
      await createPlannedSession(userId, event.id, intent);

      const title = intent.focus || 'Planned workout';
      await supabase
        .from('trainer_calendar_events')
        .update({ title })
        .eq('id', event.id)
        .eq('user_id', userId);
    }
    createdCount = createdEvents.length;
  }

  return { created: createdCount };
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
  syncCalendarFromProgram
};
