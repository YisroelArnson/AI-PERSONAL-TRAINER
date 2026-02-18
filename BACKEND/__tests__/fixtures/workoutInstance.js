const { repsExercise, holdExercise, durationExercise, intervalsExercise } = require('./exercises');

const sampleWorkoutInstance = {
  title: 'Upper Body Push Day',
  estimated_duration_min: 45,
  focus: ['chest', 'shoulders', 'triceps'],
  exercises: [durationExercise, repsExercise, holdExercise, intervalsExercise],
  metadata: {
    intent: 'planned',
    request_text: null,
    planned_session: null,
    generated_at: '2026-02-16T10:00:00.000Z'
  }
};

const emptyWorkoutInstance = {
  title: "Today's Workout",
  estimated_duration_min: null,
  focus: [],
  exercises: [],
  metadata: {
    intent: 'planned',
    request_text: null,
    planned_session: null,
    generated_at: '2026-02-16T10:00:00.000Z'
  }
};

module.exports = { sampleWorkoutInstance, emptyWorkoutInstance };
