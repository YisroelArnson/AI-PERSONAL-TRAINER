const { z } = require('zod');

const {
  workoutSessionStateSchema,
  workoutSetActualSchema
} = require('../../runtime/schemas/workout.schema');

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();

const completeCurrentSetRequestSchema = z.object({
  sessionKey: nonEmptyStringSchema.optional(),
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  setIndex: z.number().int().nonnegative(),
  expectedStateVersion: nullableIntegerSchema,
  workoutSetId: nonEmptyStringSchema.optional(),
  actual: workoutSetActualSchema.optional(),
  userNote: z.string().trim().min(1).max(4000).optional()
});

const workoutSessionControlRequestSchema = z.object({
  sessionKey: nonEmptyStringSchema.optional(),
  workoutSessionId: nonEmptyStringSchema,
  expectedStateVersion: nullableIntegerSchema
});

const skipCurrentExerciseRequestSchema = z.object({
  sessionKey: nonEmptyStringSchema.optional(),
  workoutSessionId: nonEmptyStringSchema,
  workoutExerciseId: nonEmptyStringSchema,
  expectedStateVersion: nullableIntegerSchema
});

const workoutActionAgentFollowUpSchema = z.object({
  status: z.enum(['queued', 'not_queued', 'failed']),
  runId: nonEmptyStringSchema.nullable().optional(),
  streamUrl: nonEmptyStringSchema.nullable().optional(),
  jobId: nonEmptyStringSchema.nullable().optional()
});

const workoutExecutionActionResponseSchema = z.object({
  status: z.literal('ok'),
  workout: workoutSessionStateSchema,
  appliedStateVersion: z.number().int().nonnegative(),
  agentFollowUp: workoutActionAgentFollowUpSchema
});

function parseCompleteCurrentSetRequest(body) {
  return completeCurrentSetRequestSchema.parse(body);
}

function parseWorkoutSessionControlRequest(body) {
  return workoutSessionControlRequestSchema.parse(body);
}

function parseSkipCurrentExerciseRequest(body) {
  return skipCurrentExerciseRequestSchema.parse(body);
}

function parseWorkoutExecutionActionResponse(body) {
  return workoutExecutionActionResponseSchema.parse(body);
}

module.exports = {
  completeCurrentSetRequestSchema,
  workoutSessionControlRequestSchema,
  skipCurrentExerciseRequestSchema,
  workoutExecutionActionResponseSchema,
  workoutActionAgentFollowUpSchema,
  parseCompleteCurrentSetRequest,
  parseWorkoutSessionControlRequest,
  parseSkipCurrentExerciseRequest,
  parseWorkoutExecutionActionResponse
};
