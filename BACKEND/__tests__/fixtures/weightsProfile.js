const sampleWeightsProfile = {
  id: 'wp-1',
  user_id: 'user-1',
  version: 3,
  profile_json: [
    { equipment: 'dumbbell', movement: 'bench press', load: 25, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'dumbbell', movement: 'shoulder press', load: 20, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'barbell', movement: 'squat', load: 135, load_unit: 'lbs', confidence: 'high' },
    { equipment: 'cable', movement: 'row', load: 50, load_unit: 'lbs', confidence: 'low' },
    { equipment: 'bodyweight', movement: 'pull-up', load: 0, load_unit: 'lbs', confidence: 'moderate' },
    { equipment: 'kettlebell', movement: 'swing', load: 35, load_unit: 'lbs', confidence: 'moderate' }
  ],
  trigger_type: 'session_complete',
  trigger_session_id: 'sess-prev',
  created_at: '2026-02-15T20:00:00.000Z'
};

const emptyWeightsProfile = {
  id: 'wp-0',
  user_id: 'user-1',
  version: 1,
  profile_json: [],
  trigger_type: 'initial_inference',
  trigger_session_id: null,
  created_at: '2026-02-10T10:00:00.000Z'
};

module.exports = { sampleWeightsProfile, emptyWeightsProfile };
