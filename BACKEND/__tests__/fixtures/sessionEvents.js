const sampleSetEvents = [
  {
    id: 'evt-1', session_id: 'sess-1', sequence_number: 1,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 10, load: 25 }, timestamp: '2026-02-16T10:05:00Z' }
  },
  {
    id: 'evt-2', session_id: 'sess-1', sequence_number: 2,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 10, load: 25 }, timestamp: '2026-02-16T10:06:00Z' }
  },
  {
    id: 'evt-3', session_id: 'sess-1', sequence_number: 3,
    event_type: 'log_set',
    data: { payload: { index: 0, reps_completed: 8, load: 25 }, timestamp: '2026-02-16T10:07:00Z' }
  },
  {
    id: 'evt-4', session_id: 'sess-1', sequence_number: 4,
    event_type: 'log_set',
    data: { payload: { index: 1, reps_completed: 12, load: 30 }, timestamp: '2026-02-16T10:10:00Z' }
  }
];

const sampleIntervalEvents = [
  {
    id: 'evt-5', session_id: 'sess-1', sequence_number: 5,
    event_type: 'log_interval',
    data: { payload: { index: 2, duration_sec: 180 }, timestamp: '2026-02-16T10:15:00Z' }
  }
];

const sampleSafetyEvents = [
  {
    id: 'evt-6', session_id: 'sess-1', sequence_number: 6,
    event_type: 'safety_flag',
    data: { payload: { index: 1, area: 'left shoulder' }, timestamp: '2026-02-16T10:12:00Z' }
  }
];

const sampleActionEvents = [
  {
    id: 'evt-7', session_id: 'sess-1', sequence_number: 7,
    event_type: 'action',
    data: { action_type: 'swap_exercise', payload: { index: 1 }, timestamp: '2026-02-16T10:11:00Z' }
  }
];

module.exports = { sampleSetEvents, sampleIntervalEvents, sampleSafetyEvents, sampleActionEvents };
