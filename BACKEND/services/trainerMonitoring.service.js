const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sanitizeLimit(value, fallback = 8, max = 52) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function generateWeeklyReport(userId, weekStart = null) {
  const startDate = weekStart ? new Date(weekStart) : startOfWeek(new Date());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const { data: sessions, error } = await supabase
    .from('workout_sessions')
    .select('id, completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', startDate.toISOString())
    .lt('completed_at', endDate.toISOString())
    .order('completed_at', { ascending: false });

  if (error) throw error;

  const sessionCount = sessions?.length || 0;
  const report = {
    week_start: startDate.toISOString().slice(0, 10),
    sessions_completed: sessionCount,
    wins: sessionCount > 0 ? ['Nice consistency this week.'] : ['Let’s aim for one session next week.'],
    focus: sessionCount > 0 ? 'Keep momentum with balanced sessions.' : 'Start with short sessions to build habit.'
  };

  const { data: saved, error: saveError } = await supabase
    .from('trainer_weekly_reports')
    .insert({
      user_id: userId,
      week_start: report.week_start,
      report_json: report
    })
    .select()
    .single();

  if (saveError) throw saveError;
  return saved;
}

async function listReports(userId, limit = 8) {
  const safeLimit = sanitizeLimit(limit, 8, 52);

  const { data, error } = await supabase
    .from('trainer_weekly_reports')
    .select('*')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

module.exports = {
  generateWeeklyReport,
  listReports
};
