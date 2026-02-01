const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function upsertMemory(userId, payload) {
  const record = {
    user_id: userId,
    memory_type: payload.memory_type,
    key: payload.key,
    value_json: payload.value_json,
    status: payload.status || 'active',
    confidence: payload.confidence || 'med',
    sensitivity: payload.sensitivity || 'normal',
    source: payload.source || 'user_edit',
    expires_at: payload.expires_at || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('trainer_user_memory_items')
    .upsert(record, { onConflict: 'user_id,key' })
    .select()
    .single();

  if (error) throw error;

  await supabase.from('trainer_user_memory_events').insert({
    memory_id: data.id,
    event_type: 'upsert',
    data: record
  });

  return data;
}

async function listMemory(userId, types = []) {
  let query = supabase
    .from('trainer_user_memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (types.length) {
    query = query.in('memory_type', types);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function forgetMemory(userId, key) {
  const { data, error } = await supabase
    .from('trainer_user_memory_items')
    .update({
      status: 'deprecated',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('key', key)
    .select()
    .single();

  if (error) throw error;

  await supabase.from('trainer_user_memory_events').insert({
    memory_id: data.id,
    event_type: 'forget',
    data: { key }
  });

  return data;
}

module.exports = {
  upsertMemory,
  listMemory,
  forgetMemory
};
