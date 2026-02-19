const {
  buildInitialPayload,
  applyCommandReducer,
  normalizePayload
} = require('../services/workoutTrackingV2.service');

describe('workoutTrackingV2 reducer', () => {
  test('complete_set updates performance and marks status in_progress/completed', () => {
    const payload = buildInitialPayload({
      exercise_name: 'Bench Press',
      exercise_type: 'reps',
      sets: 2,
      reps: [10, 8],
      load_each: [40, 45],
      load_unit: 'lb'
    });

    const first = applyCommandReducer(normalizePayload(payload), 'pending', {
      type: 'complete_set',
      set_index: 0,
      actual_reps: 10,
      actual_load: 40,
      load_unit: 'lb'
    });

    expect(first.status).toBe('in_progress');
    expect(first.payload.performance.sets[0].actual_reps).toBe(10);

    const second = applyCommandReducer(first.payload, first.status, {
      type: 'complete_set',
      set_index: 1,
      actual_reps: 8,
      actual_load: 45,
      load_unit: 'lb'
    });

    expect(second.status).toBe('completed');
    expect(second.metrics.total_reps).toBe(18);
    expect(second.metrics.volume).toBe(760);
  });

  test('skip/unskip transitions status and preserves payload shape', () => {
    const payload = buildInitialPayload({
      exercise_name: 'Plank',
      exercise_type: 'hold',
      sets: 2,
      hold_duration_sec: [30, 45]
    });

    const skipped = applyCommandReducer(normalizePayload(payload), 'pending', {
      type: 'skip_exercise',
      reason: 'pain'
    });

    expect(skipped.status).toBe('skipped');
    expect(skipped.payload.flags.skip_reason).toBe('pain');

    const reopened = applyCommandReducer(skipped.payload, skipped.status, {
      type: 'unskip_exercise'
    });

    expect(reopened.status).toBe('pending');
    expect(reopened.payload.flags.skip_reason).toBeNull();
  });
});
