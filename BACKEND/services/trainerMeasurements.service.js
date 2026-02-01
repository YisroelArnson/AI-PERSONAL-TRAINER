const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

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
  let query = supabase
    .from('trainer_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(limit);

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

module.exports = {
  logMeasurement,
  listMeasurements,
  correctMeasurement
};
