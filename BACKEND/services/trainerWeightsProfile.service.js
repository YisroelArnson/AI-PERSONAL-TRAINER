const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');
const { fetchMultipleDataSources } = require('./dataSources.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function sanitizeLimit(value, fallback = 10, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function nowIso() {
  return new Date().toISOString();
}

function extractJson(text) {
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

async function getLatestProfile(userId) {
  const { data, error } = await supabase
    .from('trainer_weights_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getProfileHistory(userId, limit = 10) {
  const safeLimit = sanitizeLimit(limit, 10, 100);

  const { data, error } = await supabase
    .from('trainer_weights_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

async function getNextVersion(userId) {
  const latest = await getLatestProfile(userId);
  return (latest?.version || 0) + 1;
}

async function createInitialProfile(userId) {
  const dataSourceResults = await fetchMultipleDataSources(
    ['user_profile', 'user_settings', 'all_locations'],
    userId
  );

  const dataMap = {};
  for (const result of dataSourceResults) {
    dataMap[result.source] = result.raw;
  }

  const userProfile = dataMap.user_profile || {};
  const settings = dataMap.user_settings || {};
  const locations = dataMap.all_locations || [];
  const weightUnit = settings.weight_unit || 'lbs';

  const currentLocation = locations.find(loc => loc.current_location) || locations[0];
  const equipment = currentLocation
    ? (currentLocation.equipment || []).map(eq => typeof eq === 'string' ? eq : eq.name)
    : [];

  const prompt = `Based on this user's profile, infer reasonable starting weights for common exercises they might do.

User Profile:
- Sex: ${userProfile.sex || 'unknown'}
- Height: ${userProfile.height_cm || 'unknown'} cm
- Weight: ${userProfile.weight_kg || 'unknown'} kg
- Available equipment: ${equipment.length ? equipment.join(', ') : 'bodyweight only'}
- Preferred unit: ${weightUnit}

Return JSON only with this structure:
{
  "entries": [
    {
      "equipment": "dumbbell",
      "movement": "bench press",
      "load": 20,
      "load_unit": "${weightUnit}",
      "confidence": "low"
    }
  ]
}

Generate 10-15 entries covering major movement patterns (push, pull, squat, hinge, carry, core) using the available equipment. Use conservative starting weights — it's better to start too light. Confidence should be "low" for all initial inferences since we haven't observed the user yet.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: 'You are a strength coach. Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');

  if (!parsed?.entries || !Array.isArray(parsed.entries)) {
    throw new Error('Failed to parse initial weights profile from AI response');
  }

  const version = await getNextVersion(userId);
  const { data, error } = await supabase
    .from('trainer_weights_profiles')
    .insert({
      user_id: userId,
      version,
      profile_json: parsed.entries,
      trigger_type: 'initial_inference',
      created_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;
  console.log(`[weights-profile] Initial profile created for user ${userId} — ${parsed.entries.length} entries, version ${version}`);
  return data;
}

async function updateAfterSession(userId, sessionId, workoutInstance, sessionSummary) {
  const latest = await getLatestProfile(userId);
  const currentEntries = latest?.profile_json || [];

  const prompt = `Review this completed workout session and update the user's weights profile.

Current Weights Profile:
${JSON.stringify(currentEntries, null, 2)}

Workout That Was Generated:
${JSON.stringify(workoutInstance, null, 2)}

Session Summary:
${JSON.stringify(sessionSummary, null, 2)}

Based on what was prescribed and how the session went:
1. Update loads for exercises that were completed (increase confidence from "low" to "moderate" or "moderate" to "high")
2. If the summary indicates the workout was easy (low RPE), slightly increase loads
3. If pain was flagged on an exercise, reduce that load and lower confidence
4. Add new entries for any exercises not already in the profile
5. Keep existing entries unchanged if the exercise wasn't in this session

Return JSON only:
{
  "entries": [
    {
      "equipment": "dumbbell",
      "movement": "bench press",
      "load": 25,
      "load_unit": "lbs",
      "confidence": "moderate"
    }
  ]
}

Return the COMPLETE updated profile (all entries, not just changed ones).`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: 'You are a strength coach tracking client progress. Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');

  if (!parsed?.entries || !Array.isArray(parsed.entries)) {
    console.error(`[weights-profile] Failed to parse updated profile for user ${userId}`);
    return null;
  }

  const version = await getNextVersion(userId);
  const { data, error } = await supabase
    .from('trainer_weights_profiles')
    .insert({
      user_id: userId,
      version,
      profile_json: parsed.entries,
      trigger_type: 'session_complete',
      trigger_session_id: sessionId,
      created_at: nowIso()
    })
    .select()
    .single();

  if (error) {
    console.error(`[weights-profile] Failed to save updated profile:`, error.message);
    return null;
  }

  console.log(`[weights-profile] Profile updated for user ${userId} — ${parsed.entries.length} entries, version ${version}, trigger session ${sessionId}`);
  return data;
}

function formatProfileForPrompt(profileRecord) {
  if (!profileRecord?.profile_json) return null;

  const entries = profileRecord.profile_json;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const lines = entries.map(e =>
    `- ${e.equipment ? e.equipment + ' ' : ''}${e.movement}: ${e.load} ${e.load_unit} (confidence: ${e.confidence})`
  );

  return lines.join('\n');
}

module.exports = {
  getLatestProfile,
  getProfileHistory,
  createInitialProfile,
  updateAfterSession,
  formatProfileForPrompt,
  // Exported for testing
  extractJson,
  getNextVersion
};
