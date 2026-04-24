/**
 * File overview:
 * Defines parsing and validation helpers for the coach surface payloads.
 *
 * Main functions in this file:
 * - parseCoachSurfaceResponse: Parses Coach surface response into a validated shape.
 */

const { z } = require('zod');

const {
  workoutPhaseSchema,
  workoutSessionStateSchema
} = require('../../runtime/schemas/workout.schema');

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = nonEmptyStringSchema.nullable().optional();
const nullableIntegerSchema = z.number().int().nonnegative().nullable().optional();

const coachCardActionSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  icon: nullableStringSchema,
  actionType: z.enum([
    'submit_message',
    'toggle_pin',
    'open_details',
    'start_workout',
    'complete_current_set',
    'skip_current_exercise',
    'pause_workout',
    'resume_workout',
    'finish_workout'
  ]),
  semanticAction: nullableStringSchema,
  triggerType: nullableStringSchema,
  message: nullableStringSchema,
  style: z.enum(['primary', 'secondary', 'destructive']).default('secondary'),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const coachMetricChipSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  value: nonEmptyStringSchema,
  tone: z.enum(['neutral', 'success', 'warning']).default('neutral')
});

const coachWorkoutCurrentCardSchema = z.object({
  type: z.literal('workout_current'),
  workoutSessionId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  subtitle: nullableStringSchema,
  phase: workoutPhaseSchema,
  progressLabel: nonEmptyStringSchema,
  currentExerciseName: nullableStringSchema,
  currentSetLabel: nullableStringSchema,
  coachCue: nullableStringSchema,
  metrics: z.array(coachMetricChipSchema).default([]),
  actions: z.array(coachCardActionSchema).default([])
});

const coachWorkoutSummaryCardSchema = z.object({
  type: z.literal('workout_summary'),
  workoutSessionId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  subtitle: nullableStringSchema,
  highlights: z.array(nonEmptyStringSchema).default([]),
  metrics: z.array(coachMetricChipSchema).default([]),
  actions: z.array(coachCardActionSchema).default([])
});

const coachInsightCardSchema = z.object({
  type: z.literal('insight'),
  title: nonEmptyStringSchema,
  body: nonEmptyStringSchema,
  actions: z.array(coachCardActionSchema).default([])
});

const coachCardPayloadSchema = z.discriminatedUnion('type', [
  coachWorkoutCurrentCardSchema,
  coachWorkoutSummaryCardSchema,
  coachInsightCardSchema
]);

const coachFeedItemBaseSchema = z.object({
  id: nonEmptyStringSchema,
  messageId: nullableStringSchema,
  turnId: nullableStringSchema,
  role: z.enum(['assistant', 'user', 'system']),
  eventType: nonEmptyStringSchema,
  runId: nullableStringSchema,
  seqNum: nullableIntegerSchema,
  occurredAt: nullableStringSchema
});

const coachMessageFeedItemSchema = coachFeedItemBaseSchema.extend({
  kind: z.literal('message'),
  text: nonEmptyStringSchema
});

const coachCardFeedItemSchema = coachFeedItemBaseSchema.extend({
  kind: z.literal('card'),
  text: nonEmptyStringSchema,
  card: coachCardPayloadSchema
});

const coachFeedItemSchema = z.discriminatedUnion('kind', [
  coachMessageFeedItemSchema,
  coachCardFeedItemSchema
]);

const coachSurfaceHeaderSchema = z.object({
  title: nonEmptyStringSchema,
  subtitle: nonEmptyStringSchema
});

const coachRunSummarySchema = z.object({
  runId: nonEmptyStringSchema,
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']),
  triggerType: nonEmptyStringSchema,
  createdAt: nullableStringSchema,
  startedAt: nullableStringSchema,
  finishedAt: nullableStringSchema,
  provider: nullableStringSchema,
  model: nullableStringSchema
});

const coachPinnedCardSchema = z.object({
  feedItemId: nonEmptyStringSchema,
  reason: z.enum(['active_workout', 'manual_pin', 'system_priority']).default('active_workout'),
  placement: z.literal('above_composer').default('above_composer')
});

const coachComposerContractSchema = z.object({
  placeholder: nonEmptyStringSchema,
  supportsText: z.boolean(),
  supportsVoice: z.boolean()
});

const coachQuickActionSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  icon: nonEmptyStringSchema,
  triggerType: nonEmptyStringSchema,
  message: nonEmptyStringSchema
});

const coachSurfaceResponseSchema = z.object({
  generatedAt: nonEmptyStringSchema,
  sessionKey: nonEmptyStringSchema,
  sessionId: nullableStringSchema,
  header: coachSurfaceHeaderSchema,
  activeRun: coachRunSummarySchema.nullable(),
  workout: workoutSessionStateSchema.nullable(),
  pinnedCard: coachPinnedCardSchema.nullable(),
  feed: z.array(coachFeedItemSchema).default([]),
  composer: coachComposerContractSchema,
  quickActions: z.array(coachQuickActionSchema).default([])
});

/**
 * Parses Coach surface response into a validated shape.
 */
function parseCoachSurfaceResponse(input) {
  return coachSurfaceResponseSchema.parse(input);
}

module.exports = {
  coachCardActionSchema,
  coachMetricChipSchema,
  coachCardPayloadSchema,
  coachFeedItemSchema,
  coachPinnedCardSchema,
  coachSurfaceResponseSchema,
  parseCoachSurfaceResponse
};
