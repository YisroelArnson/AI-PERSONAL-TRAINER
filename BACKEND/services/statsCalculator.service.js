const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function calculateSessionStats({ exercises = [], events = [], session = {}, log = {} }) {
  const totalExercises = exercises.length;
  const exercisesCompleted = exercises.filter(ex => ex.status === 'completed' || ex.status === 'skipped').length;
  const exercisesSkipped = exercises.filter(ex => ex.status === 'skipped').length;
  const totalReps = exercises.reduce((sum, ex) => sum + Number(ex.total_reps || 0), 0);
  const totalVolume = exercises.reduce((sum, ex) => sum + Number(ex.volume || 0), 0);
  const totalDurationSec = exercises.reduce((sum, ex) => sum + Number(ex.duration_sec || 0), 0);

  let totalSets = 0;
  for (const ex of exercises) {
    const sets = ex.payload_json?.performance?.sets || [];
    totalSets += sets.filter(set => {
      return (
        set?.actual_reps !== null && set?.actual_reps !== undefined
        || set?.actual_duration_sec !== null && set?.actual_duration_sec !== undefined
        || set?.actual_distance_km !== null && set?.actual_distance_km !== undefined
        || set?.actual_load !== null && set?.actual_load !== undefined
      );
    }).length;
  }

  const painFlags = events.reduce((count, event) => {
    if (event.event_type === 'safety_flag') return count + 1;
    if (event.event_type !== 'action') return count;
    const notes = String(event?.data?.command?.notes || '').toLowerCase();
    return notes.includes('pain') ? count + 1 : count;
  }, 0);

  let workoutDurationMin = Number(log?.actual_duration_min);
  if (!Number.isFinite(workoutDurationMin) && session.started_at && session.completed_at) {
    const startMs = new Date(session.started_at).getTime();
    const endMs = new Date(session.completed_at).getTime();
    if (endMs > startMs) {
      workoutDurationMin = Math.round((endMs - startMs) / 60000);
    }
  }

  return {
    total_exercises: totalExercises,
    exercises_completed: exercisesCompleted,
    exercises_skipped: exercisesSkipped,
    total_sets: totalSets,
    total_reps: totalReps,
    total_volume: totalVolume,
    cardio_time_min: Math.round((totalDurationSec / 60) * 10) / 10,
    workout_duration_min: workoutDurationMin,
    pain_flags: painFlags,
    energy_rating: Number.isFinite(log?.reflection?.rpe) ? log.reflection.rpe : null
  };
}

function extractExercisesFromInstance(instanceJson = {}) {
  const sourceExercises = Array.isArray(instanceJson.exercises) ? instanceJson.exercises : [];
  return sourceExercises.map(exercise => {
    const tracking = exercise?._tracking && typeof exercise._tracking === 'object' && !Array.isArray(exercise._tracking)
      ? exercise._tracking
      : {};

    return {
      status: tracking.status || 'pending',
      total_reps: Number(tracking.total_reps || 0),
      volume: Number(tracking.volume || 0),
      duration_sec: Number(tracking.duration_sec || 0),
      payload_json: tracking.payload_json || {}
    };
  });
}

async function calculateWeeklyStats(userId, weekStart, weekEnd) {
  const { data: sessions, error: sessError } = await supabase
    .from('trainer_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', weekStart.toISOString())
    .lte('started_at', weekEnd.toISOString())
    .order('started_at', { ascending: true });

  if (sessError) throw sessError;

  const { count: plannedCount, error: planError } = await supabase
    .from('trainer_calendar_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'workout')
    .gte('start_at', weekStart.toISOString())
    .lte('start_at', weekEnd.toISOString());

  if (planError) throw planError;

  const sessionsCompleted = sessions?.length || 0;
  const sessionIds = (sessions || []).map(session => session.id);

  let latestInstances = [];
  let events = [];
  let logs = [];

  if (sessionIds.length) {
    const { data: instanceRows, error: instanceError } = await supabase
      .from('trainer_workout_instances')
      .select('*')
      .in('session_id', sessionIds)
      .order('version', { ascending: false });
    if (instanceError) throw instanceError;

    const latestBySession = new Map();
    for (const row of (instanceRows || [])) {
      if (!latestBySession.has(row.session_id)) latestBySession.set(row.session_id, row);
    }
    latestInstances = Array.from(latestBySession.values());

    const { data: eventRows, error: eventError } = await supabase
      .from('trainer_workout_events')
      .select('*')
      .in('session_id', sessionIds)
      .in('event_type', ['action', 'safety_flag']);
    if (eventError) throw eventError;
    events = eventRows || [];

    const { data: logRows, error: logError } = await supabase
      .from('trainer_workout_logs')
      .select('session_id, log_json')
      .in('session_id', sessionIds);
    if (logError) throw logError;
    logs = logRows || [];
  }

  const instanceBySession = new Map(latestInstances.map(row => [row.session_id, row]));
  const eventsBySession = new Map();
  for (const event of events) {
    if (!eventsBySession.has(event.session_id)) eventsBySession.set(event.session_id, []);
    eventsBySession.get(event.session_id).push(event);
  }
  const logBySession = new Map((logs || []).map(row => [row.session_id, row.log_json || {}]));

  let totalReps = 0;
  let totalVolume = 0;
  let totalCardioMin = 0;
  let totalWorkoutMin = 0;
  let totalEnergy = 0;
  let energyCount = 0;

  for (const session of (sessions || [])) {
    const instanceRow = instanceBySession.get(session.id) || null;
    const workoutExercises = instanceRow ? extractExercisesFromInstance(instanceRow.instance_json || {}) : [];
    const sessionEvents = eventsBySession.get(session.id) || [];
    const sessionLog = logBySession.get(session.id) || {};

    const stats = calculateSessionStats({
      exercises: workoutExercises,
      events: sessionEvents,
      session,
      log: sessionLog
    });

    totalReps += stats.total_reps;
    totalVolume += stats.total_volume;
    totalCardioMin += stats.cardio_time_min;
    if (stats.workout_duration_min) totalWorkoutMin += stats.workout_duration_min;
    if (stats.energy_rating) {
      totalEnergy += stats.energy_rating;
      energyCount++;
    }
  }

  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekEnd = new Date(weekStart);

  const { data: priorSessions } = await supabase
    .from('trainer_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', priorWeekStart.toISOString())
    .lt('started_at', priorWeekEnd.toISOString());

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
      volume: 'flat',
      cardio: 'flat'
    }
  };
}

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
