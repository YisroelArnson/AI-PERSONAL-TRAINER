const repsExercise = {
  exercise_name: 'Dumbbell Bench Press',
  exercise_type: 'reps',
  muscles_utilized: [{ muscle: 'chest', share: 0.6 }, { muscle: 'triceps', share: 0.3 }, { muscle: 'shoulders', share: 0.1 }],
  goals_addressed: [{ goal: 'upper body strength', share: 1.0 }],
  reasoning: 'Primary horizontal press for chest development',
  exercise_description: 'Lie on a flat bench with a dumbbell in each hand. Press up to full extension, then lower to chest level.',
  equipment: ['dumbbell', 'bench'],
  sets: 3,
  reps: [10, 10, 10],
  load_each: [25],
  load_unit: 'lbs',
  hold_duration_sec: null,
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: 90
};

const holdExercise = {
  exercise_name: 'Plank',
  exercise_type: 'hold',
  muscles_utilized: [{ muscle: 'core', share: 0.8 }, { muscle: 'shoulders', share: 0.2 }],
  goals_addressed: [{ goal: 'core stability', share: 1.0 }],
  reasoning: 'Core stabilization exercise',
  exercise_description: 'Hold a straight-arm plank position with a neutral spine.',
  equipment: [],
  sets: 3,
  reps: null,
  load_each: null,
  load_unit: null,
  hold_duration_sec: [30, 30, 30],
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: 60
};

const durationExercise = {
  exercise_name: 'Treadmill Walk',
  exercise_type: 'duration',
  muscles_utilized: [{ muscle: 'legs', share: 0.7 }, { muscle: 'cardiovascular', share: 0.3 }],
  goals_addressed: [{ goal: 'cardiovascular endurance', share: 1.0 }],
  reasoning: 'Low intensity cardio warm-up',
  exercise_description: 'Walk at a brisk pace on the treadmill.',
  equipment: ['treadmill'],
  sets: null,
  reps: null,
  load_each: null,
  load_unit: null,
  hold_duration_sec: null,
  duration_min: 10,
  distance_km: null,
  distance_unit: null,
  rounds: null,
  work_sec: null,
  rest_seconds: null
};

const intervalsExercise = {
  exercise_name: 'Kettlebell Swings',
  exercise_type: 'intervals',
  muscles_utilized: [{ muscle: 'glutes', share: 0.4 }, { muscle: 'hamstrings', share: 0.3 }, { muscle: 'core', share: 0.3 }],
  goals_addressed: [{ goal: 'power endurance', share: 1.0 }],
  reasoning: 'Posterior chain power with metabolic conditioning',
  exercise_description: 'Hinge at the hips and swing the kettlebell to shoulder height.',
  equipment: ['kettlebell'],
  sets: null,
  reps: null,
  load_each: null,
  load_unit: null,
  hold_duration_sec: null,
  duration_min: null,
  distance_km: null,
  distance_unit: null,
  rounds: 5,
  work_sec: 30,
  rest_seconds: 30
};

module.exports = { repsExercise, holdExercise, durationExercise, intervalsExercise };
