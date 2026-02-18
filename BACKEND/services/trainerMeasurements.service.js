const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

function sanitizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function logMeasurement(userId, payload) {
  const record = {
    user_id: userId,
    measurement_type: payload.measurement_type,
    value: payload.value,
    unit: payload.unit,
    measured_at: payload.measured_at || new Date().toISOString(),
    source: payload.source || 'user_manual',
    source_detail: payload.source_detail || null,
    notes: payload.notes || null,
    supersedes_id: payload.supersedes_id || null
  };

  const { data, error } = await supabase
    .from('trainer_measurements')
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listMeasurements(userId, types = [], limit = 50) {
  const safeLimit = sanitizeLimit(limit, 50, 200);

  let query = supabase
    .from('trainer_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(safeLimit);

  if (types.length) {
    query = query.in('measurement_type', types);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function correctMeasurement(userId, measurementId, payload) {
  return logMeasurement(userId, {
    ...payload,
    supersedes_id: measurementId
  });
}

/**
 * Get the latest measurement for each requested type.
 * Returns an object keyed by measurement_type, e.g. { weight: {...}, height: {...} }
 */
async function getLatestByTypes(userId, types) {
  const { data, error } = await supabase
    .from('trainer_measurements')
    .select('*')
    .eq('user_id', userId)
    .in('measurement_type', types)
    .order('measured_at', { ascending: false });

  if (error) throw error;

  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.measurement_type]) {
      latest[row.measurement_type] = row;
    }
  }
  return latest;
}

module.exports = {
  logMeasurement,
  listMeasurements,
  correctMeasurement,
  getLatestByTypes
};
