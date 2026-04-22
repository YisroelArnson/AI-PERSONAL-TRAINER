/**
 * File overview:
 * Defines parsing and validation helpers for the workout commands payloads.
 *
 * Main functions in this file:
 * - parseWorkoutCommandRequest: Parses Workout command request into a validated shape.
 * - parseWorkoutCommandResponse: Parses Workout command response into a validated shape.
 */

const { z } = require('zod');

const { llmSelectionSchema } = require('./llm.schema');
const {
  workoutSessionStateSchema,
  workoutSetActualSchema,
  workoutSetTargetSchema
} = require('../../runtime/schemas/workout.schema');
const {
  workoutDecisionSchema,
  workoutExerciseDraftSchema,
  workoutFlowDirectiveSchema
} = require('../../runtime/schemas/workout-tool-contracts.schema');

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();

const workoutCommandTypeSchema = z.enum([
  'session.start',
  'set.complete',
  'set.skip',
  'exercise.skip',
  'session.pause',
  'session.resume',
  'session.finish',
  'set.targets.adjust',
  'exercise.replace',
  'workout.remaining.rewrite'
]);

const workoutCommandOriginSchema = z.object({
  actor: z.enum(['user_ui', 'agent', 'system']),
  deviceId: nonEmptyStringSchema.optional(),
  runId: nonEmptyStringSchema.optional(),
  occurredAt: nonEmptyStringSchema.optional()
});

const finishSummarySchema = z.object({
  coachSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  agentSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  adaptationSummary: z.string().trim().min(1).max(4000).nullable().optional()
}).default({});

const setCompletePayloadSchema = z.object({
  workoutExerciseId: nonEmptyStringSchema,
  setIndex: z.number().int().nonnegative(),
  workoutSetId: nonEmptyStringSchema.optional(),
  actual: workoutSetActualSchema.optional(),
  userNote: z.string().trim().min(1).max(4000).optional()
});

const exerciseSkipPayloadSchema = z.object({
  workoutExerciseId: nonEmptyStringSchema
});

const sessionFinishPayloadSchema = z.object({
  finalStatus: z.enum(['completed', 'canceled', 'abandoned']).default('completed'),
  summary: finishSummarySchema.optional()
});

const setTargetsAdjustPayloadSchema = z.object({
  workoutExerciseId: nonEmptyStringSchema,
  decision: workoutDecisionSchema,
  setUpdates: z.array(z.object({
    setIndex: z.number().int().nonnegative(),
    target: workoutSetTargetSchema,
    note: z.string().trim().min(1).max(4000).nullable().optional()
  })).min(1),
  flow: workoutFlowDirectiveSchema.default({})
});

const exerciseReplacePayloadSchema = z.object({
  workoutExerciseId: nonEmptyStringSchema,
  decision: workoutDecisionSchema,
  replacement: workoutExerciseDraftSchema,
  flow: workoutFlowDirectiveSchema.default({})
});

const workoutRewriteRemainingPayloadSchema = z.object({
  decision: workoutDecisionSchema,
  title: z.string().trim().min(1).max(4000).nullable().optional(),
  guidance: z.record(z.string(), z.unknown()).default({}),
  remainingExercises: z.array(workoutExerciseDraftSchema).min(1),
  flow: workoutFlowDirectiveSchema.default({})
});

const payloadSchemaByCommandType = {
  'session.start': z.object({}).default({}),
  'set.complete': setCompletePayloadSchema,
  'set.skip': setCompletePayloadSchema,
  'exercise.skip': exerciseSkipPayloadSchema,
  'session.pause': z.object({}).default({}),
  'session.resume': z.object({}).default({}),
  'session.finish': sessionFinishPayloadSchema.default({}),
  'set.targets.adjust': setTargetsAdjustPayloadSchema,
  'exercise.replace': exerciseReplacePayloadSchema,
  'workout.remaining.rewrite': workoutRewriteRemainingPayloadSchema
};

const workoutCommandRequestSchema = z.object({
  commandId: nonEmptyStringSchema,
  sessionKey: nonEmptyStringSchema.optional(),
  workoutSessionId: nonEmptyStringSchema,
  commandType: workoutCommandTypeSchema,
  origin: workoutCommandOriginSchema,
  baseStateVersion: nullableIntegerSchema,
  clientSequence: z.number().int().nonnegative().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  llm: llmSelectionSchema.optional()
}).superRefine((value, ctx) => {
  const payloadSchema = payloadSchemaByCommandType[value.commandType];

  if (!payloadSchema) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['commandType'],
      message: 'Unsupported workout command type.'
    });
    return;
  }

  const parsedPayload = payloadSchema.safeParse(value.payload || {});
  if (!parsedPayload.success) {
    const firstIssue = parsedPayload.error.issues[0];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload', ...(firstIssue.path || [])],
      message: firstIssue.message
    });
    return;
  }

  if (value.origin.actor === 'user_ui' && value.commandType === 'session.finish') {
    const finalStatus = parsedPayload.data.finalStatus || 'completed';
    if (finalStatus !== 'completed') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'finalStatus'],
        message: 'User UI finish commands must use finalStatus=completed.'
      });
    }
  }
});

const workoutCommandConflictSchema = z.object({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  winner: nonEmptyStringSchema.nullable().optional(),
  latestStateVersion: z.number().int().nonnegative().nullable().optional(),
  latestServerSequence: z.number().int().nonnegative().nullable().optional()
}).nullable().optional();

const workoutCommandFollowUpSchema = z.object({
  status: z.enum(['queued', 'not_queued', 'failed']),
  deliveryMode: z.enum(['background', 'foreground']).nullable().optional(),
  runId: nonEmptyStringSchema.nullable().optional(),
  streamUrl: nonEmptyStringSchema.nullable().optional(),
  jobId: nonEmptyStringSchema.nullable().optional()
});

const workoutCommandResultSchema = z.object({
  commandId: nonEmptyStringSchema,
  commandType: workoutCommandTypeSchema,
  actor: z.enum(['user_ui', 'agent', 'system']),
  clientSequence: z.number().int().nonnegative().nullable().optional(),
  serverSequence: z.number().int().nonnegative(),
  status: z.enum(['accepted', 'replayed', 'noop', 'rejected']),
  resolution: z.enum([
    'applied',
    'duplicate',
    'noop_terminal',
    'stale',
    'conflict_user_priority',
    'invalid_target',
    'not_live',
    'rejected'
  ]),
  appliedStateVersion: z.number().int().nonnegative().nullable().optional(),
  conflict: workoutCommandConflictSchema,
  isUndoable: z.boolean().default(false)
});

const workoutCommandResponseSchema = z.object({
  status: z.literal('ok'),
  command: workoutCommandResultSchema,
  workout: workoutSessionStateSchema,
  appliedStateVersion: z.number().int().nonnegative(),
  agentFollowUp: workoutCommandFollowUpSchema
});

/**
 * Parses Workout command request into a validated shape.
 */
function parseWorkoutCommandRequest(body) {
  const parsed = workoutCommandRequestSchema.parse(body);
  const payloadSchema = payloadSchemaByCommandType[parsed.commandType];

  return {
    ...parsed,
    payload: payloadSchema.parse(parsed.payload || {})
  };
}

/**
 * Parses Workout command response into a validated shape.
 */
function parseWorkoutCommandResponse(body) {
  return workoutCommandResponseSchema.parse(body);
}

module.exports = {
  workoutCommandTypeSchema,
  workoutCommandOriginSchema,
  workoutCommandRequestSchema,
  workoutCommandResponseSchema,
  workoutCommandResultSchema,
  workoutCommandFollowUpSchema,
  payloadSchemaByCommandType,
  parseWorkoutCommandRequest,
  parseWorkoutCommandResponse
};
