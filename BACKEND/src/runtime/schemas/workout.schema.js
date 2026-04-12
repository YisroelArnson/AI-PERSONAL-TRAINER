const { z } = require('zod');

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = nonEmptyStringSchema.nullable().optional();
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();
const nullableNumberSchema = z.number().nonnegative().nullable().optional();
const nullableBooleanSchema = z.boolean().nullable().optional();

const workoutStatusSchema = z.enum([
  'queued',
  'in_progress',
  'paused',
  'completed',
  'canceled',
  'abandoned'
]);

const workoutPhaseSchema = z.enum([
  'preview',
  'exercise',
  'rest',
  'transition',
  'finished'
]);

const workoutExerciseStatusSchema = z.enum([
  'pending',
  'active',
  'completed',
  'skipped',
  'canceled'
]);

const workoutSetStatusSchema = z.enum([
  'pending',
  'active',
  'completed',
  'skipped'
]);

const workoutTrackingModeSchema = z.enum([
  'reps_load',
  'reps_only',
  'duration',
  'distance',
  'bodyweight',
  'custom'
]);

const weightUnitSchema = z.enum(['lb', 'kg']);
const readinessLevelSchema = z.enum(['low', 'medium', 'high']);
const workoutAdjustmentSourceSchema = z.enum(['agent', 'user_message', 'ui_action', 'system']);
const workoutSideSchema = z.enum(['bilateral', 'left', 'right', 'alternating']);
const workoutAdjustmentTypeSchema = z.enum([
  'adjust_load',
  'adjust_reps',
  'adjust_duration',
  'swap_exercise',
  'mark_too_hard',
  'mark_pain_flag',
  'start_rest',
  'end_rest',
  'note'
]);

const workoutGuidanceSchema = z.object({
  origin: z.enum([
    'agent_generated',
    'user_requested',
    'quick_action',
    'app_open',
    'continuation'
  ]).default('agent_generated'),
  goal: nullableStringSchema,
  timeCapMinutes: nullableIntegerSchema,
  equipment: z.array(nonEmptyStringSchema).default([]),
  focusAreas: z.array(nonEmptyStringSchema).default([]),
  constraints: z.array(nonEmptyStringSchema).default([]),
  painFlags: z.array(nonEmptyStringSchema).default([]),
  readiness: z.object({
    energy: readinessLevelSchema.nullable().optional(),
    soreness: readinessLevelSchema.nullable().optional(),
    motivation: readinessLevelSchema.nullable().optional()
  }).default({}),
  source: z.object({
    triggerType: nullableStringSchema,
    runId: nullableStringSchema
  }).default({})
});

const workoutRepRangeSchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative()
}).refine(value => value.max >= value.min, {
  message: 'repRange.max must be greater than or equal to repRange.min'
});

const workoutLoadSchema = z.object({
  value: z.number().nonnegative(),
  unit: weightUnitSchema.nullable().optional()
});

const workoutLoadPrescriptionSchema = z.object({
  mode: z.enum(['exact', 'relative_change', 'percent_1rm', 'bodyweight', 'rpe', 'text']),
  value: nullableNumberSchema,
  unit: weightUnitSchema.nullable().optional(),
  percent1rm: z.number().min(0).max(300).nullable().optional(),
  delta: z.number().nullable().optional(),
  text: nullableStringSchema
});

const workoutSetTargetSchema = z.object({
  reps: nullableIntegerSchema,
  repRange: workoutRepRangeSchema.nullable().optional(),
  load: workoutLoadSchema.nullable().optional(),
  loadPrescription: workoutLoadPrescriptionSchema.nullable().optional(),
  durationSec: nullableIntegerSchema,
  distanceM: nullableIntegerSchema,
  rpe: z.number().min(0).max(10).nullable().optional(),
  rir: z.number().min(0).max(10).nullable().optional(),
  restSec: nullableIntegerSchema,
  tempo: nullableStringSchema,
  side: workoutSideSchema.nullable().optional(),
  instruction: nullableStringSchema,
  isWarmup: nullableBooleanSchema,
  isAmrap: nullableBooleanSchema
});

const workoutSetActualSchema = z.object({
  reps: nullableIntegerSchema,
  load: workoutLoadSchema.nullable().optional(),
  durationSec: nullableIntegerSchema,
  distanceM: nullableIntegerSchema,
  rpe: z.number().min(0).max(10).nullable().optional(),
  side: workoutSideSchema.nullable().optional()
});

const workoutExercisePrescriptionSchema = z.object({
  trackingMode: workoutTrackingModeSchema.default('reps_only'),
  blockLabel: nullableStringSchema,
  movementPattern: nullableStringSchema,
  restSec: nullableIntegerSchema,
  tempo: nullableStringSchema,
  intensityCue: nullableStringSchema,
  objective: nullableStringSchema,
  selectionReason: nullableStringSchema,
  adaptationReason: nullableStringSchema,
  notes: nullableStringSchema,
  equipment: z.array(nonEmptyStringSchema).default([]),
  tags: z.array(nonEmptyStringSchema).default([]),
  coachingCues: z.array(nonEmptyStringSchema).default([]),
  substitutionTags: z.array(nonEmptyStringSchema).default([]),
  rounds: nullableIntegerSchema
});

const workoutAdjustmentSchema = z.object({
  adjustmentId: nullableStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  setIndex: nullableIntegerSchema,
  adjustmentType: workoutAdjustmentTypeSchema,
  source: workoutAdjustmentSourceSchema,
  reason: nullableStringSchema,
  before: z.record(z.string(), z.unknown()).nullable().optional(),
  after: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: nullableStringSchema
});

const workoutSetStateSchema = z.object({
  workoutSetId: nonEmptyStringSchema,
  setIndex: z.number().int().nonnegative(),
  status: workoutSetStatusSchema,
  target: workoutSetTargetSchema.default({}),
  actual: workoutSetActualSchema.default({}),
  notes: nullableStringSchema,
  startedAt: nullableStringSchema,
  completedAt: nullableStringSchema
});

const workoutExerciseStateSchema = z.object({
  workoutExerciseId: nonEmptyStringSchema,
  workoutSessionId: nonEmptyStringSchema,
  orderIndex: z.number().int().nonnegative(),
  exerciseId: nullableStringSchema,
  exerciseKey: nullableStringSchema,
  exerciseName: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  status: workoutExerciseStatusSchema,
  prescription: workoutExercisePrescriptionSchema.default({}),
  coachMessage: nullableStringSchema,
  startedAt: nullableStringSchema,
  completedAt: nullableStringSchema,
  sets: z.array(workoutSetStateSchema).default([]),
  adjustments: z.array(workoutAdjustmentSchema).default([])
});

const workoutProgressSchema = z.object({
  completedExercises: z.number().int().nonnegative(),
  totalExercises: z.number().int().nonnegative(),
  completedSets: z.number().int().nonnegative(),
  totalSets: z.number().int().nonnegative(),
  remainingExercises: z.number().int().nonnegative()
});

const workoutSessionStateSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  sessionKey: nonEmptyStringSchema,
  stateVersion: z.number().int().nonnegative(),
  status: workoutStatusSchema,
  currentPhase: workoutPhaseSchema,
  title: nullableStringSchema,
  guidance: workoutGuidanceSchema.default({}),
  summary: z.object({
    coachSummary: nullableStringSchema,
    agentSummary: nullableStringSchema,
    adaptationSummary: nullableStringSchema,
    estimatedDurationMinutes: nullableIntegerSchema,
    totalVolumeLoad: nullableNumberSchema
  }).default({}),
  currentExerciseIndex: nullableIntegerSchema,
  currentSetIndex: nullableIntegerSchema,
  startedAt: nullableStringSchema,
  completedAt: nullableStringSchema,
  updatedAt: nullableStringSchema,
  currentExerciseId: nullableStringSchema,
  progress: workoutProgressSchema,
  exercises: z.array(workoutExerciseStateSchema).default([])
});

function parseWorkoutSessionState(input) {
  return workoutSessionStateSchema.parse(input);
}

module.exports = {
  workoutStatusSchema,
  workoutPhaseSchema,
  workoutExerciseStatusSchema,
  workoutSetStatusSchema,
  workoutTrackingModeSchema,
  workoutSideSchema,
  workoutRepRangeSchema,
  workoutLoadPrescriptionSchema,
  workoutGuidanceSchema,
  workoutSetTargetSchema,
  workoutSetActualSchema,
  workoutExercisePrescriptionSchema,
  workoutAdjustmentSchema,
  workoutSetStateSchema,
  workoutExerciseStateSchema,
  workoutProgressSchema,
  workoutSessionStateSchema,
  parseWorkoutSessionState
};
