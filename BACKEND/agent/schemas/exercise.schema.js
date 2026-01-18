// BACKEND/agent/schemas/exercise.schema.js
// Zod schemas for exercise types
const { z } = require('zod');

// Base fields for all exercise types
const BaseExerciseSchema = z.object({
  name: z.string().describe('Exercise name'),
  instructions: z.string().optional().describe('Brief form cues'),
  notes: z.string().optional().describe('Modifications or tips'),
  categories: z.array(z.string()).describe('Exercise categories (e.g., strength, cardio)'),
  muscles: z.array(z.string()).describe('Target muscles')
});

// Reps-based exercises (e.g., pushups, squats)
const RepsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('reps'),
  sets: z.number().int().min(1).describe('Number of sets'),
  reps: z.number().int().min(1).describe('Reps per set'),
  rest_between_sets: z.number().int().optional().describe('Rest in seconds between sets')
});

// Hold exercises (e.g., plank, wall sit)
const HoldExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('hold'),
  sets: z.number().int().min(1).describe('Number of sets'),
  hold_time: z.number().int().min(1).describe('Hold duration in seconds'),
  rest_between_sets: z.number().int().optional().describe('Rest in seconds between sets')
});

// Duration exercises (e.g., running, jumping jacks)
const DurationExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('duration'),
  duration: z.number().int().min(1).describe('Total duration in seconds')
});

// Interval exercises (e.g., HIIT, Tabata)
const IntervalsExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('intervals'),
  rounds: z.number().int().min(1).describe('Number of rounds'),
  work_time: z.number().int().min(1).describe('Work period in seconds'),
  rest_time: z.number().int().min(0).describe('Rest period in seconds')
});

// Union of all exercise types
const ExerciseSchema = z.discriminatedUnion('type', [
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema
]);

// Full workout response schema
const WorkoutResponseSchema = z.object({
  exercises: z.array(ExerciseSchema).min(1).describe('Array of exercises'),
  summary: z.object({
    total_duration_estimate: z.number().optional().describe('Estimated duration in minutes'),
    focus_areas: z.array(z.string()).optional().describe('Main focus areas'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
  }).optional()
});

module.exports = {
  BaseExerciseSchema,
  RepsExerciseSchema,
  HoldExerciseSchema,
  DurationExerciseSchema,
  IntervalsExerciseSchema,
  ExerciseSchema,
  WorkoutResponseSchema
};
