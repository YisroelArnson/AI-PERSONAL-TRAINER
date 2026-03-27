const { z } = require('zod');

const {
  workoutGuidanceSchema,
  workoutPhaseSchema,
  workoutExercisePrescriptionSchema,
  workoutSetTargetSchema,
  workoutSetActualSchema
} = require('./workout.schema');

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = nonEmptyStringSchema.nullable().optional();
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();

const workoutDecisionTypeSchema = z.enum([
  'initial_generation',
  'user_request',
  'time_constraint',
  'equipment_constraint',
  'pain_response',
  'difficulty_response',
  'fatigue_adjustment',
  'progression',
  'regression',
  'form_adjustment',
  'session_wrap_up'
]);

const workoutDecisionSchema = z.object({
  decisionType: workoutDecisionTypeSchema,
  rationale: nonEmptyStringSchema,
  userSignal: nullableStringSchema,
  constraintsConsidered: z.array(nonEmptyStringSchema).default([]),
  preserveCompletedWork: z.boolean().default(true)
});

const workoutSetDraftSchema = z.object({
  setIndex: z.number().int().nonnegative(),
  target: workoutSetTargetSchema.default({}),
  notes: nullableStringSchema
});

const workoutExerciseDraftSchema = z.object({
  orderIndex: z.number().int().nonnegative(),
  exerciseId: nullableStringSchema,
  exerciseKey: nullableStringSchema,
  exerciseName: nonEmptyStringSchema,
  displayName: nullableStringSchema,
  coachMessage: nullableStringSchema,
  prescription: workoutExercisePrescriptionSchema.default({}),
  sets: z.array(workoutSetDraftSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const workoutFlowDirectiveSchema = z.object({
  currentPhase: workoutPhaseSchema.nullable().optional(),
  currentExerciseIndex: nullableIntegerSchema,
  currentSetIndex: nullableIntegerSchema,
  startRestSec: nullableIntegerSchema
});

const workoutGenerateToolInputSchema = z.object({
  title: nullableStringSchema,
  guidance: workoutGuidanceSchema.default({}),
  summary: z.object({
    coachSummary: nullableStringSchema,
    agentSummary: nullableStringSchema,
    estimatedDurationMinutes: nullableIntegerSchema
  }).default({}),
  decision: workoutDecisionSchema,
  exercises: z.array(workoutExerciseDraftSchema).min(1),
  startMode: z.enum(['preview', 'start_immediately']).default('preview')
});

const workoutRewriteRemainingToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  decision: workoutDecisionSchema,
  title: nullableStringSchema,
  guidance: workoutGuidanceSchema.default({}),
  remainingExercises: z.array(workoutExerciseDraftSchema).min(1),
  flow: workoutFlowDirectiveSchema.default({})
});

const workoutReplaceExerciseToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  decision: workoutDecisionSchema,
  replacement: workoutExerciseDraftSchema,
  flow: workoutFlowDirectiveSchema.default({})
});

const workoutSessionControlToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  action: z.enum(['start', 'pause', 'resume']),
  expectedStateVersion: nullableIntegerSchema
});

const workoutSkipExerciseToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nullableStringSchema.default('current'),
  expectedStateVersion: nullableIntegerSchema
});

const workoutAdjustSetTargetsToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  decision: workoutDecisionSchema,
  setUpdates: z.array(z.object({
    setIndex: z.number().int().nonnegative(),
    target: workoutSetTargetSchema,
    note: nullableStringSchema
  })).min(1),
  flow: workoutFlowDirectiveSchema.default({})
});

const workoutRecordSetResultToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  setIndex: z.number().int().nonnegative(),
  resultStatus: z.enum(['completed', 'skipped']),
  expectedStateVersion: nullableIntegerSchema,
  actual: workoutSetActualSchema.default({}),
  userNote: nullableStringSchema,
  decision: workoutDecisionSchema,
  flow: workoutFlowDirectiveSchema.default({})
});

const workoutFinishSessionToolInputSchema = z.object({
  workoutSessionId: nonEmptyStringSchema,
  finalStatus: z.enum(['completed', 'canceled', 'abandoned']),
  expectedStateVersion: nullableIntegerSchema,
  decision: workoutDecisionSchema,
  summary: z.object({
    coachSummary: nullableStringSchema,
    agentSummary: nullableStringSchema,
    adaptationSummary: nullableStringSchema
  }).default({})
});

function stripJsonSchemaMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(stripJsonSchemaMetadata);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$schema')
        .map(([key, nestedValue]) => [key, stripJsonSchemaMetadata(nestedValue)])
    );
  }

  return value;
}

function toProviderInputSchema(schema) {
  return stripJsonSchemaMetadata(z.toJSONSchema(schema, { io: 'input' }));
}

const workoutGenerateToolInputJsonSchema = toProviderInputSchema(workoutGenerateToolInputSchema);
const workoutRewriteRemainingToolInputJsonSchema = toProviderInputSchema(workoutRewriteRemainingToolInputSchema);
const workoutReplaceExerciseToolInputJsonSchema = toProviderInputSchema(workoutReplaceExerciseToolInputSchema);
const workoutSessionControlToolInputJsonSchema = toProviderInputSchema(workoutSessionControlToolInputSchema);
const workoutSkipExerciseToolInputJsonSchema = toProviderInputSchema(workoutSkipExerciseToolInputSchema);
const workoutAdjustSetTargetsToolInputJsonSchema = toProviderInputSchema(workoutAdjustSetTargetsToolInputSchema);
const workoutRecordSetResultToolInputJsonSchema = toProviderInputSchema(workoutRecordSetResultToolInputSchema);
const workoutFinishSessionToolInputJsonSchema = toProviderInputSchema(workoutFinishSessionToolInputSchema);

function parseWorkoutGenerateToolInput(input) {
  return workoutGenerateToolInputSchema.parse(input);
}

module.exports = {
  workoutDecisionTypeSchema,
  workoutDecisionSchema,
  workoutSetDraftSchema,
  workoutExerciseDraftSchema,
  workoutFlowDirectiveSchema,
  workoutGenerateToolInputSchema,
  workoutRewriteRemainingToolInputSchema,
  workoutReplaceExerciseToolInputSchema,
  workoutSessionControlToolInputSchema,
  workoutSkipExerciseToolInputSchema,
  workoutAdjustSetTargetsToolInputSchema,
  workoutRecordSetResultToolInputSchema,
  workoutFinishSessionToolInputSchema,
  workoutGenerateToolInputJsonSchema,
  workoutRewriteRemainingToolInputJsonSchema,
  workoutReplaceExerciseToolInputJsonSchema,
  workoutSessionControlToolInputJsonSchema,
  workoutSkipExerciseToolInputJsonSchema,
  workoutAdjustSetTargetsToolInputJsonSchema,
  workoutRecordSetResultToolInputJsonSchema,
  workoutFinishSessionToolInputJsonSchema,
  parseWorkoutGenerateToolInput
};
