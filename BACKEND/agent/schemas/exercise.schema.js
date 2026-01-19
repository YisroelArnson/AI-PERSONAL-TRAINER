// BACKEND/agent/schemas/exercise.schema.js
// Exercise schema definitions for the 4-type exercise system
const { z } = require('zod');

// Valid muscle names (16 preset)
const VALID_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs',
  'Lower Back', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves',
  'Trapezius', 'Abductors', 'Adductors', 'Forearms', 'Neck'
];

// Group types for circuits, supersets, etc.
const GROUP_TYPES = ['circuit', 'superset', 'giant_set', 'warmup', 'cooldown', 'sequence'];

// Exercise types (4 core types)
const EXERCISE_TYPES = ['reps', 'hold', 'duration', 'intervals'];

// Muscle utilization schema
const MuscleUtilizationSchema = z.object({
  muscle: z.enum(VALID_MUSCLES).describe('Muscle name'),
  share: z.number().min(0).max(1).describe('Utilization share 0.0-1.0')
});

// Goal utilization schema
const GoalUtilizationSchema = z.object({
  goal: z.string().describe('Goal category (e.g., "strength", "endurance", "flexibility")'),
  share: z.number().min(0).max(1).describe('How much this exercise addresses the goal 0.0-1.0')
});

// Group schema for circuits, supersets, etc.
const ExerciseGroupSchema = z.object({
  id: z.string().describe('Unique group identifier (e.g., "circuit-1", "superset-a")'),
  type: z.enum(GROUP_TYPES).describe('How to execute the group'),
  position: z.number().int().positive().describe('Order within group (1-indexed)'),
  name: z.string().optional().describe('Display name (set on first exercise only)'),
  rounds: z.number().int().positive().optional().describe('Times to repeat group (set on first exercise only)'),
  rest_between_rounds_sec: z.number().int().nonnegative().optional().describe('Rest after completing group')
}).nullable().optional();

// Base fields shared by all exercise types
const BaseExerciseSchema = z.object({
  // Identity & ordering
  exercise_name: z.string().describe('Exercise name'),
  order: z.number().int().positive().describe('Position in workout (1-indexed)'),

  // Grouping (optional - for circuits, supersets, etc.)
  group: ExerciseGroupSchema,

  // Metadata
  muscles_utilized: z.array(MuscleUtilizationSchema).refine(
    muscles => muscles.length === 0 || Math.abs(muscles.reduce((sum, m) => sum + m.share, 0) - 1.0) < 0.05,
    { message: 'Muscle shares must sum to approximately 1.0' }
  ).describe('Muscles worked with utilization percentages'),

  goals_addressed: z.array(GoalUtilizationSchema).refine(
    goals => goals.length === 0 || Math.abs(goals.reduce((sum, g) => sum + g.share, 0) - 1.0) < 0.05,
    { message: 'Goal shares must sum to approximately 1.0' }
  ).describe('Fitness goals this exercise addresses'),

  reasoning: z.string().max(300).describe('Brief explanation for this exercise selection'),
  exercise_description: z.string().optional().describe('Instructions on how to perform the exercise'),
  equipment: z.array(z.string()).optional().describe('Equipment needed')
});

// Type: reps - Count repetitions across sets (strength, bodyweight)
const RepsExerciseSchema = BaseExerciseSchema.extend({
  exercise_type: z.literal('reps'),
  sets: z.number().int().positive().describe('Number of sets'),
  reps: z.array(z.number().int().positive()).describe('Target reps per set'),
  load_each: z.array(z.number().nonnegative()).nullable().optional().describe('Weight per set (null for bodyweight)'),
  load_unit: z.enum(['lbs', 'kg']).nullable().optional().describe('Weight unit'),
  rest_sec: z.number().int().nonnegative().describe('Rest between sets in seconds')
});

// Type: hold - Hold positions for time (isometric, balance, static stretches)
const HoldExerciseSchema = BaseExerciseSchema.extend({
  exercise_type: z.literal('hold'),
  sets: z.number().int().positive().describe('Number of sets'),
  hold_sec: z.array(z.number().int().positive()).describe('Hold duration per set in seconds'),
  rest_sec: z.number().int().nonnegative().describe('Rest between sets in seconds')
});

// Type: duration - Continuous effort (cardio, yoga flows)
const DurationExerciseSchema = BaseExerciseSchema.extend({
  exercise_type: z.literal('duration'),
  duration_min: z.number().positive().describe('Total duration in minutes'),
  distance: z.number().positive().nullable().optional().describe('Target distance (optional)'),
  distance_unit: z.enum(['km', 'mi']).nullable().optional().describe('Distance unit'),
  target_pace: z.string().nullable().optional().describe('Target pace (e.g., "5:30/km")')
});

// Type: intervals - Work/rest cycles (HIIT, tabata)
const IntervalsExerciseSchema = BaseExerciseSchema.extend({
  exercise_type: z.literal('intervals'),
  rounds: z.number().int().positive().describe('Number of rounds'),
  work_sec: z.number().int().positive().describe('Work interval in seconds'),
  rest_sec: z.number().int().nonnegative().describe('Rest interval in seconds')
});

// Combined exercise schema (discriminated union)
const ExerciseSchema = z.discriminatedUnion('exercise_type', [
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema
]);

// Workout response schema (what the agent produces)
const WorkoutResponseSchema = z.object({
  exercises: z.array(ExerciseSchema),
  summary: z.object({
    title: z.string().optional(),
    estimated_duration_min: z.number().positive().optional(),
    primary_goals: z.array(z.string()).optional(),
    muscles_targeted: z.array(z.string()).optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
  }).optional()
});

module.exports = {
  // Schemas
  ExerciseSchema,
  WorkoutResponseSchema,
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema,
  BaseExerciseSchema,
  MuscleUtilizationSchema,
  GoalUtilizationSchema,
  ExerciseGroupSchema,

  // Constants
  VALID_MUSCLES,
  GROUP_TYPES,
  EXERCISE_TYPES
};
