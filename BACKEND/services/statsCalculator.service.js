const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Calculate per-session stats from workout events and instance data.
 * Deterministic — no LLM calls.
 */
function calculateSessionStats(instance, events, session) {
  const exercises = instance?.exercises || [];
  const setEvents = events.filter(e => e.event_type === 'log_set');
  const intervalEvents = events.filter(e => e.event_type === 'log_interval');
  const safetyEvents = events.filter(e => e.event_type === 'safety_flag');

  let totalSets = 0;
  let totalReps = 0;
  let totalVolume = 0;
  let cardioTimeMin = 0;

  for (const evt of setEvents) {
    const d = evt.data?.payload || evt.data || {};
    totalSets++;
    const reps = d.reps_completed || d.reps || 0;
    totalReps += reps;
    const load = d.load || d.weight || 0;
    totalVolume += reps * load;
  }

  for (const evt of intervalEvents) {
    const d = evt.data?.payload || evt.data || {};
    const durationSec = d.duration_sec || d.work_sec || 0;
    cardioTimeMin += durationSec / 60;
  }

  // Calculate duration exercises from instance
  for (const ex of exercises) {
    if (ex.exercise_type === 'duration' && ex.duration_min) {
      cardioTimeMin += ex.duration_min;
    }
  }

  // Workout duration from session timestamps
  let workoutDurationMin = null;
  if (session.created_at && session.updated_at) {
    const startMs = new Date(session.created_at).getTime();
    const endMs = new Date(session.updated_at).getTime();
    if (endMs > startMs) {
      workoutDurationMin = Math.round((endMs - startMs) / 60000);
    }
  }

  // Exercises skipped = planned - those with at least one logged event
  const exercisesWithLogs = new Set();
  for (const evt of setEvents) {
    const idx = evt.data?.payload?.index ?? evt.data?.index;
    if (idx !== undefined) exercisesWithLogs.add(idx);
  }
  for (const evt of intervalEvents) {
    const idx = evt.data?.payload?.index ?? evt.data?.index;
    if (idx !== undefined) exercisesWithLogs.add(idx);
  }
  const exercisesCompleted = exercisesWithLogs.size || exercises.length;
  const exercisesSkipped = Math.max(0, exercises.length - exercisesCompleted);

  // Pain flags
  const painFlags = safetyEvents.length;

  // Energy rating from reflection or session metadata
  const energyRating = session.metadata?.energy_level || null;

  return {
    total_exercises: exercises.length,
    exercises_completed: exercisesCompleted,
    exercises_skipped: exercisesSkipped,
    total_sets: totalSets,
    total_reps: totalReps,
    total_volume: totalVolume,
    cardio_time_min: Math.round(cardioTimeMin * 10) / 10,
    workout_duration_min: workoutDurationMin,
    pain_flags: painFlags,
    energy_rating: energyRating
  };
}

/**
 * Calculate weekly rollup from session data for a given week.
 * @param {string} userId
 * @param {Date} weekStart - Monday of the week
 * @param {Date} weekEnd - Sunday end of the week
 */
async function calculateWeeklyStats(userId, weekStart, weekEnd) {
  // Get completed sessions in the date range
  const { data: sessions, error: sessError } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString())
    .order('created_at', { ascending: true });

  if (sessError) throw sessError;

  // Get planned events count for the week
  const { count: plannedCount, error: planError } = await supabase
    .from('trainer_calendar_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'workout')
    .gte('start_at', weekStart.toISOString())
    .lte('start_at', weekEnd.toISOString());

  if (planError) throw planError;

  const sessionsCompleted = sessions?.length || 0;

  // Aggregate per-session stats
  let totalReps = 0;
  let totalVolume = 0;
  let totalCardioMin = 0;
  let totalWorkoutMin = 0;
  let totalEnergy = 0;
  let energyCount = 0;

  for (const session of (sessions || [])) {
    // Get instance for this session
    const { data: instance } = await supabase
      .from('trainer_workout_instances')
      .select('instance_json')
      .eq('session_id', session.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get events for this session
    const { data: events } = await supabase
      .from('trainer_workout_events')
      .select('*')
      .eq('session_id', session.id);

    const stats = calculateSessionStats(
      instance?.instance_json,
      events || [],
      session
    );

    totalReps += stats.total_reps;
    totalVolume += stats.total_volume;
    totalCardioMin += stats.cardio_time_min;
    if (stats.workout_duration_min) totalWorkoutMin += stats.workout_duration_min;
    if (stats.energy_rating) {
      totalEnergy += stats.energy_rating;
      energyCount++;
    }
  }

  // Get prior week stats for trends
  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekEnd = new Date(weekStart);

  const { data: priorSessions } = await supabase
    .from('trainer_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('created_at', priorWeekStart.toISOString())
    .lt('created_at', priorWeekEnd.toISOString());

  const priorSessionCount = priorSessions?.length || 0;

  const trend = (current, prior) => {
    if (prior === 0 && current === 0) return 'flat';
    if (current > prior) return 'up';
    if (current < prior) return 'down';
    return 'flat';
  };

  return {
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    sessions_completed: sessionsCompleted,
    sessions_planned: plannedCount || 0,
    total_reps: totalReps,
    total_volume: Math.round(totalVolume),
    total_cardio_min: Math.round(totalCardioMin * 10) / 10,
    total_workout_min: totalWorkoutMin,
    avg_energy_rating: energyCount > 0 ? Math.round((totalEnergy / energyCount) * 10) / 10 : null,
    avg_session_duration_min: sessionsCompleted > 0 ? Math.round(totalWorkoutMin / sessionsCompleted) : null,
    trends: {
      sessions: trend(sessionsCompleted, priorSessionCount),
      volume: 'flat', // Would need prior week volume for accurate trend
      cardio: 'flat'
    }
  };
}

/**
 * Get the current week's Monday and Sunday.
 */
function getCurrentWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { weekStart: monday, weekEnd: sunday };
}

module.exports = {
  calculateSessionStats,
  calculateWeeklyStats,
  getCurrentWeekBounds
};
