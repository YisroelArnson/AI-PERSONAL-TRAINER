jest.mock('@supabase/supabase-js', () => {
  const { buildSupabaseMock } = require('./helpers/supabaseMock');
  return buildSupabaseMock();
});

jest.mock('../services/modelProviders.service', () => ({
  getAnthropicClient: jest.fn()
}));

jest.mock('../services/dataSources.service', () => ({
  fetchMultipleDataSources: jest.fn().mockResolvedValue([])
}));

const {
  extractJson,
  normalizeExercise,
  normalizeWorkoutInstance,
  buildUserContextSummary,
  adjustExerciseIntensity,
  scaleWorkoutInstance,
  estimateWorkoutDuration,
  applyAction,
  getLatestInstance
} = require('../services/trainerWorkouts.service');

const { __mockChain: mockChain } = require('@supabase/supabase-js');
const { getAnthropicClient } = require('../services/modelProviders.service');
const { createMockAnthropicClient } = require('./helpers/anthropicMock');
const { repsExercise, holdExercise, durationExercise, intervalsExercise } = require('./fixtures/exercises');
const { sampleWorkoutInstance, emptyWorkoutInstance } = require('./fixtures/workoutInstance');

// ─── extractJson ─────────────────────────────────────────────────────

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"x":1}')).toEqual({ x: 1 });
  });

  it('extracts JSON from surrounding text', () => {
    expect(extractJson('result: {"exercises": []} end')).toEqual({ exercises: [] });
  });

  it('returns null for null/empty/missing braces', () => {
    expect(extractJson(null)).toBe(null);
    expect(extractJson('')).toBe(null);
    expect(extractJson('no json')).toBe(null);
  });

  it('returns null for invalid JSON', () => {
    expect(extractJson('{bad json}')).toBe(null);
  });
});

// ─── normalizeExercise ───────────────────────────────────────────────

describe('normalizeExercise', () => {
  it('normalizes a standard reps exercise', () => {
    const result = normalizeExercise(repsExercise);
    expect(result.exercise_name).toBe('Dumbbell Bench Press');
    expect(result.exercise_type).toBe('reps');
    expect(result.sets).toBe(3);
    expect(result.reps).toEqual([10, 10, 10]);
    expect(result.rest_seconds).toBe(90);
  });

  it('handles alternative field names', () => {
    const alt = {
      name: 'Squat',
      type: 'reps',
      load_each: [20],
      hold_sec: [30],
      rest_sec: 60
    };
    const result = normalizeExercise(alt);
    expect(result.exercise_name).toBe('Squat');
    expect(result.exercise_type).toBe('reps');
    expect(result.load_each).toEqual([20]);
    expect(result.hold_duration_sec).toEqual([30]);
    expect(result.rest_seconds).toBe(60);
  });

  it('defaults missing fields to null or empty', () => {
    const result = normalizeExercise({});
    expect(result.exercise_name).toBeUndefined();
    expect(result.muscles_utilized).toEqual([]);
    expect(result.goals_addressed).toEqual([]);
    expect(result.reasoning).toBe('');
    expect(result.sets).toBe(null);
    expect(result.reps).toBe(null);
  });
});

// ─── normalizeWorkoutInstance ────────────────────────────────────────

describe('normalizeWorkoutInstance', () => {
  it('normalizes a complete workout instance', () => {
    const raw = {
      title: 'Test Workout',
      estimated_duration_min: 45,
      focus: ['chest'],
      exercises: [repsExercise]
    };
    const result = normalizeWorkoutInstance(raw, { intent: 'planned' });
    expect(result.title).toBe('Test Workout');
    expect(result.estimated_duration_min).toBe(45);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].exercise_name).toBe('Dumbbell Bench Press');
    expect(result.metadata.intent).toBe('planned');
  });

  it('defaults title and empty exercises', () => {
    const result = normalizeWorkoutInstance({});
    expect(result.title).toBe("Today's Workout");
    expect(result.exercises).toEqual([]);
    expect(result.focus).toEqual([]);
  });

  it('handles alternative duration_min field', () => {
    const result = normalizeWorkoutInstance({ duration_min: 30 });
    expect(result.estimated_duration_min).toBe(30);
  });
});

// ─── buildUserContextSummary ─────────────────────────────────────────

describe('buildUserContextSummary', () => {
  it('builds context from full data sources', () => {
    const dataSources = [
      { source: 'user_profile', raw: { sex: 'male', height_cm: 180, weight_kg: 80 } },
      { source: 'all_locations', raw: [{ name: 'Home Gym', current_location: true, equipment: ['dumbbell', 'bench'] }] },
      { source: 'user_settings', raw: { weight_unit: 'lbs', distance_unit: 'miles' } },
      { source: 'workout_history', raw: [{ exercises: [{ name: 'Bench Press' }, { name: 'Squat' }] }] }
    ];
    const result = buildUserContextSummary(dataSources);
    expect(result).toContain('sex=male');
    expect(result).toContain('height_cm=180');
    expect(result).toContain('Home Gym');
    expect(result).toContain('dumbbell, bench');
    expect(result).toContain('weight=lbs');
    expect(result).toContain('Bench Press, Squat');
  });

  it('returns empty string for no data sources', () => {
    expect(buildUserContextSummary([])).toBe('');
  });

  it('handles missing profile fields gracefully', () => {
    const dataSources = [{ source: 'user_profile', raw: {} }];
    const result = buildUserContextSummary(dataSources);
    expect(result).toContain('unknown');
  });

  it('handles equipment as objects with name field', () => {
    const dataSources = [
      { source: 'all_locations', raw: [{ name: 'Gym', current_location: true, equipment: [{ name: 'barbell' }, { name: 'rack' }] }] }
    ];
    const result = buildUserContextSummary(dataSources);
    expect(result).toContain('barbell, rack');
  });
});

// ─── adjustExerciseIntensity ─────────────────────────────────────────

describe('adjustExerciseIntensity', () => {
  it('increases intensity for "harder"', () => {
    const result = adjustExerciseIntensity(repsExercise, 'harder');
    expect(result.sets).toBeGreaterThan(repsExercise.sets);
    result.reps.forEach((rep, i) => {
      expect(rep).toBeGreaterThanOrEqual(repsExercise.reps[i]);
    });
  });

  it('decreases intensity for "easier"', () => {
    const result = adjustExerciseIntensity(repsExercise, 'easier');
    expect(result.sets).toBeLessThan(repsExercise.sets);
    result.reps.forEach((rep, i) => {
      expect(rep).toBeLessThanOrEqual(repsExercise.reps[i]);
    });
  });

  it('adjusts hold duration for hold exercises', () => {
    const result = adjustExerciseIntensity(holdExercise, 'easier');
    result.hold_duration_sec.forEach((sec, i) => {
      expect(sec).toBeLessThanOrEqual(holdExercise.hold_duration_sec[i]);
    });
  });

  it('adjusts rounds and work_sec for intervals', () => {
    const result = adjustExerciseIntensity(intervalsExercise, 'harder');
    expect(result.rounds).toBeGreaterThanOrEqual(intervalsExercise.rounds);
    expect(result.work_sec).toBeGreaterThanOrEqual(intervalsExercise.work_sec);
  });

  it('adjusts duration_min for duration exercises', () => {
    const harder = adjustExerciseIntensity(durationExercise, 'harder');
    expect(harder.duration_min).toBeGreaterThan(durationExercise.duration_min);
    const easier = adjustExerciseIntensity(durationExercise, 'easier');
    expect(easier.duration_min).toBeLessThanOrEqual(durationExercise.duration_min);
    expect(easier.duration_min).toBeGreaterThanOrEqual(5); // minimum
  });

  it('never goes below minimums', () => {
    const tiny = { ...repsExercise, sets: 1, reps: [1] };
    const result = adjustExerciseIntensity(tiny, 'easier');
    expect(result.sets).toBeGreaterThanOrEqual(1);
    result.reps.forEach(rep => expect(rep).toBeGreaterThanOrEqual(1));
  });
});

// ─── scaleWorkoutInstance ────────────────────────────────────────────

describe('scaleWorkoutInstance', () => {
  it('scales down by 0.5', () => {
    const scaled = scaleWorkoutInstance(sampleWorkoutInstance, 0.5);
    expect(scaled.estimated_duration_min).toBeLessThan(sampleWorkoutInstance.estimated_duration_min);
    expect(scaled.estimated_duration_min).toBeGreaterThanOrEqual(10);
    // Check exercises are scaled
    const origReps = sampleWorkoutInstance.exercises.find(e => e.exercise_type === 'reps');
    const scaledReps = scaled.exercises.find(e => e.exercise_type === 'reps');
    expect(scaledReps.sets).toBeLessThanOrEqual(origReps.sets);
  });

  it('scales up by 1.5', () => {
    const scaled = scaleWorkoutInstance(sampleWorkoutInstance, 1.5);
    const origReps = sampleWorkoutInstance.exercises.find(e => e.exercise_type === 'reps');
    const scaledReps = scaled.exercises.find(e => e.exercise_type === 'reps');
    expect(scaledReps.sets).toBeGreaterThanOrEqual(origReps.sets);
  });

  it('preserves non-numeric fields', () => {
    const scaled = scaleWorkoutInstance(sampleWorkoutInstance, 0.8);
    expect(scaled.title).toBe(sampleWorkoutInstance.title);
    expect(scaled.focus).toEqual(sampleWorkoutInstance.focus);
    const ex = scaled.exercises[0];
    expect(ex.exercise_name).toBe(sampleWorkoutInstance.exercises[0].exercise_name);
  });

  it('handles null estimated_duration_min', () => {
    const scaled = scaleWorkoutInstance(emptyWorkoutInstance, 0.5);
    expect(scaled.estimated_duration_min).toBe(null);
  });
});

// ─── estimateWorkoutDuration ─────────────────────────────────────────

describe('estimateWorkoutDuration', () => {
  it('returns 30 for null/empty instance', () => {
    expect(estimateWorkoutDuration(null)).toBe(30);
    expect(estimateWorkoutDuration({ exercises: [] })).toBe(30);
  });

  it('estimates duration for reps exercises', () => {
    const instance = { exercises: [repsExercise] };
    const duration = estimateWorkoutDuration(instance);
    expect(duration).toBeGreaterThan(0);
    // 3 sets × (90 rest + 30 work) = 360 sec = 6 min, but minimum is 10
    expect(duration).toBe(10);
  });

  it('includes duration exercises at face value', () => {
    const instance = { exercises: [durationExercise] };
    const duration = estimateWorkoutDuration(instance);
    expect(duration).toBe(10);
  });

  it('calculates interval exercises correctly', () => {
    const instance = { exercises: [intervalsExercise] };
    const duration = estimateWorkoutDuration(instance);
    // 5 rounds × (30 work + 30 rest) = 300 sec = 5 min, but minimum is 10
    expect(duration).toBe(10);
  });

  it('sums all exercise types', () => {
    const duration = estimateWorkoutDuration(sampleWorkoutInstance);
    expect(duration).toBeGreaterThan(10);
  });

  it('minimum is 10 minutes', () => {
    const instance = { exercises: [{ exercise_type: 'reps', sets: 1, rest_seconds: 10 }] };
    const duration = estimateWorkoutDuration(instance);
    expect(duration).toBeGreaterThanOrEqual(10);
  });
});

// ─── applyAction: time_scale ────────────────────────────────────────

describe('applyAction time_scale', () => {
  beforeEach(() => {
    mockChain.reset();
  });

  it('throws when target_duration_min is missing', async () => {
    mockChain.mockResolve({
      id: 'inst-1',
      session_id: 'sess-1',
      version: 1,
      instance_json: sampleWorkoutInstance
    });

    await expect(
      applyAction({ sessionId: 'sess-1', userId: 'user-1', actionType: 'time_scale', payload: {} })
    ).rejects.toThrow('Time scale requires target_duration_min');
  });

  it('throws when payload is null', async () => {
    mockChain.mockResolve({
      id: 'inst-1',
      session_id: 'sess-1',
      version: 1,
      instance_json: sampleWorkoutInstance
    });

    await expect(
      applyAction({ sessionId: 'sess-1', userId: 'user-1', actionType: 'time_scale', payload: null })
    ).rejects.toThrow('Time scale requires target_duration_min');
  });

  it('scales workout when target_duration_min is provided', async () => {
    mockChain.mockResolve({
      id: 'inst-1',
      session_id: 'sess-1',
      version: 1,
      instance_json: sampleWorkoutInstance
    });

    const result = await applyAction({
      sessionId: 'sess-1', userId: 'user-1', actionType: 'time_scale', payload: { target_duration_min: 20 }
    });

    expect(result.instanceUpdated).toBe(true);
    expect(result.instance).toBeDefined();
  });


});

// ─── applyAction: swap_exercise ─────────────────────────────────────

describe('applyAction swap_exercise', () => {
  const aiMock = createMockAnthropicClient();

  beforeEach(() => {
    mockChain.reset();
    aiMock.reset();
    getAnthropicClient.mockReturnValue(aiMock.client);
  });

  it('resolves exercise by exercise_name when no index is provided', async () => {
    // getLatestInstance returns an instance with the target exercise at index 1
    mockChain.mockResolve({
      id: 'inst-1',
      session_id: 'sess-1',
      version: 1,
      instance_json: sampleWorkoutInstance
    });

    // AI returns a replacement exercise
    const replacement = { ...holdExercise, exercise_name: 'Incline DB Press' };
    aiMock.mockJsonResponse({ exercise: replacement });

    // The iOS app sends exercise_name + exercise_id, but NO index
    const payload = {
      exercise_id: 'some-uuid',
      exercise_name: repsExercise.exercise_name // 'Dumbbell Bench Press' — at index 1
    };

    const result = await applyAction({
      sessionId: 'sess-1', userId: 'user-1', actionType: 'swap_exercise', payload
    });

    expect(result.instanceUpdated).toBe(true);
    // Verify generateSwapExercise was called with the correct exercise
    const aiCall = aiMock.mockCreate.mock.calls[0];
    expect(aiCall[0].messages[0].content[0].text).toContain('Dumbbell Bench Press');
  });
});
