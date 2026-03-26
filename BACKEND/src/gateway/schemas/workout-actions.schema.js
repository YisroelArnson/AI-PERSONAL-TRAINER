const { z } = require('zod');

const { coachSurfaceResponseSchema } = require('./coach-surface.schema');
const {
  workoutSessionStateSchema,
  workoutSetActualSchema
} = require('../../runtime/schemas/workout.schema');

const nonEmptyStringSchema = z.string().trim().min(1);

const completeCurrentSetRequestSchema = z.object({
  sessionKey: nonEmptyStringSchema.optional(),
  workoutSessionId: nonEmptyStringSchema.optional(),
  actual: workoutSetActualSchema.optional(),
  userNote: z.string().trim().min(1).max(4000).optional()
});

const workoutActionAgentFollowUpSchema = z.object({
  status: z.enum(['queued', 'not_queued', 'failed']),
  runId: nonEmptyStringSchema.nullable().optional(),
  streamUrl: nonEmptyStringSchema.nullable().optional(),
  jobId: nonEmptyStringSchema.nullable().optional()
});

const completeCurrentSetResponseSchema = z.object({
  status: z.literal('ok'),
  workout: workoutSessionStateSchema,
  surface: coachSurfaceResponseSchema,
  agentFollowUp: workoutActionAgentFollowUpSchema
});

function parseCompleteCurrentSetRequest(body) {
  return completeCurrentSetRequestSchema.parse(body);
}

function parseCompleteCurrentSetResponse(body) {
  return completeCurrentSetResponseSchema.parse(body);
}

module.exports = {
  completeCurrentSetRequestSchema,
  completeCurrentSetResponseSchema,
  workoutActionAgentFollowUpSchema,
  parseCompleteCurrentSetRequest,
  parseCompleteCurrentSetResponse
};
