/**
 * File overview:
 * Implements runtime service logic for coach surface read.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - canonicalSessionKey: Builds the canonical form of Session key.
 * - mapFeedItem: Maps Feed item into the structure expected downstream.
 * - mapRunSummary: Maps Run summary into the structure expected downstream.
 * - getRunSurfaceVisibility: Gets Run surface visibility needed by this file.
 * - resolveCurrentSessionState: Resolves Current session state before the next step runs.
 * - loadFeed: Loads Feed for the surrounding workflow.
 * - loadActiveRun: Loads Active run for the surrounding workflow.
 * - buildCoachSurfaceView: Builds a Coach surface view used by this file.
 */

const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { parseCoachSurfaceResponse } = require('../../gateway/schemas/coach-surface.schema');
const { buildWorkoutSurfaceDecorations } = require('./coach-surface-card-renderer.service');
const { getCurrentWorkoutState } = require('./workout-state.service');

const DEFAULT_FEED_LIMIT = 40;

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Builds the canonical form of Session key.
 */
function canonicalSessionKey(userId, sessionKey) {
  const raw = sessionKey && sessionKey.trim() ? sessionKey.trim() : `user:${userId}:main`;
  return raw.toLowerCase();
}

/**
 * Maps Feed item into the structure expected downstream.
 */
function mapFeedItem(event) {
  const payload = event.payload || {};
  const metadata = payload.metadata || {};
  const text = payload.text || payload.message || '';

  if (!text || event.event_type === 'app.opened' || metadata.hiddenInFeed === true) {
    return null;
  }

  return {
    id: event.event_id,
    messageId: event.event_id,
    turnId: event.run_id || event.event_id,
    kind: 'message',
    role: event.actor === 'assistant' ? 'assistant' : 'user',
    text,
    eventType: event.event_type,
    runId: event.run_id,
    seqNum: event.seq_num,
    occurredAt: event.occurred_at
  };
}

/**
 * Builds the earliest user event seq number for each run in the loaded window.
 */
function buildRunTriggerSeqMap(events) {
  const triggerSeqByRunId = new Map();

  for (const event of events) {
    if (
      event
      && event.actor === 'user'
      && event.run_id
      && Number.isFinite(Number(event.seq_num))
    ) {
      const runId = event.run_id;
      const seqNum = Number(event.seq_num);
      const existingSeqNum = triggerSeqByRunId.get(runId);

      if (!Number.isFinite(existingSeqNum) || seqNum < existingSeqNum) {
        triggerSeqByRunId.set(runId, seqNum);
      }
    }
  }

  return triggerSeqByRunId;
}

/**
 * Returns true when an assistant event was appended after a newer user turn superseded its run.
 */
function isStaleAssistantFeedEvent(event, events, triggerSeqByRunId) {
  if (
    !event
    || event.actor !== 'assistant'
    || !event.run_id
    || !Number.isFinite(Number(event.seq_num))
  ) {
    return false;
  }

  const triggerSeqNum = triggerSeqByRunId.get(event.run_id);

  if (!Number.isFinite(triggerSeqNum)) {
    return false;
  }

  const assistantSeqNum = Number(event.seq_num);
  return events.some(candidate => (
    candidate
    && candidate.actor === 'user'
    && Number.isFinite(Number(candidate.seq_num))
    && Number(candidate.seq_num) > triggerSeqNum
    && Number(candidate.seq_num) < assistantSeqNum
  ));
}

/**
 * Maps Run summary into the structure expected downstream.
 */
function mapRunSummary(run) {
  if (!run) {
    return null;
  }

  return {
    runId: run.run_id,
    status: run.status,
    triggerType: run.trigger_type,
    createdAt: run.created_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    provider: run.provider_key,
    model: run.model_key
  };
}

/**
 * Gets Run surface visibility needed by this file.
 */
function getRunSurfaceVisibility(run) {
  const triggerPayload = run && typeof run.trigger_payload === 'object' ? run.trigger_payload : {};
  const metadata = triggerPayload && typeof triggerPayload.metadata === 'object'
    ? triggerPayload.metadata
    : {};

  if (metadata.runVisibility === 'foreground') {
    return 'foreground';
  }

  if (run && run.trigger_type === 'app.opened') {
    return 'background';
  }

  return metadata.runVisibility === 'background' ? 'background' : 'foreground';
}

/**
 * Resolves Current session state before the next step runs.
 */
async function resolveCurrentSessionState({
  supabase,
  userId,
  sessionKey,
  sessionResetPolicy
}) {
  const { data, error } = await supabase.rpc('resolve_session_surface_state', {
    p_user_id: userId,
    p_session_key: sessionKey,
    p_user_timezone: sessionResetPolicy ? sessionResetPolicy.timezone : 'UTC',
    p_day_boundary_enabled: sessionResetPolicy ? sessionResetPolicy.dayBoundaryEnabled : true,
    p_idle_expiry_minutes: sessionResetPolicy ? sessionResetPolicy.idleExpiryMinutes : 240
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    currentSessionId: data.sessionId,
    sessionVersion: data.sessionVersion,
    rotated: data.rotated === true,
    rotationReason: data.rotationReason || null,
    previousSessionId: data.previousSessionId || null,
    sessionKey: data.sessionKey
  };
}

/**
 * Loads Feed for the surrounding workflow.
 */
async function loadFeed({ supabase, userId, sessionKey, sessionId }) {
  if (!sessionId) {
    return [];
  }

  const { data, error } = await supabase
    .from('session_events')
    .select('*')
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .order('seq_num', { ascending: false })
    .limit(DEFAULT_FEED_LIMIT);

  if (error) {
    throw error;
  }

  const orderedEvents = [...data].reverse();
  const triggerSeqByRunId = buildRunTriggerSeqMap(orderedEvents);

  return orderedEvents
    .filter(event => !isStaleAssistantFeedEvent(event, orderedEvents, triggerSeqByRunId))
    .map(mapFeedItem)
    .filter(Boolean);
}

/**
 * Loads Active run for the surrounding workflow.
 */
async function loadActiveRun({ supabase, userId, sessionKey, sessionId }) {
  if (!sessionId) {
    return null;
  }

  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
    .eq('session_id', sessionId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  const activeRuns = Array.isArray(data) ? data : [];
  const visibleRun = activeRuns.find(run => getRunSurfaceVisibility(run) !== 'background') || null;
  return mapRunSummary(visibleRun);
}

/**
 * Builds a Coach surface view used by this file.
 */
async function buildCoachSurfaceView({ userId, sessionKey, sessionResetPolicy }) {
  const supabase = getAdminClientOrThrow();
  const resolvedSessionKey = canonicalSessionKey(userId, sessionKey);
  const sessionState = await resolveCurrentSessionState({
    supabase,
    userId,
    sessionKey: resolvedSessionKey,
    sessionResetPolicy
  });
  const currentSessionId = sessionState ? sessionState.currentSessionId : null;
  const [feed, activeRun, workout] = await Promise.all([
    loadFeed({
      supabase,
      userId,
      sessionKey: resolvedSessionKey,
      sessionId: currentSessionId
    }),
    loadActiveRun({
      supabase,
      userId,
      sessionKey: resolvedSessionKey,
      sessionId: currentSessionId
    }),
    getCurrentWorkoutState({
      userId,
      sessionKey: resolvedSessionKey
    })
  ]);
  const workoutDecorations = buildWorkoutSurfaceDecorations({
    workout,
    activeRun
  });
  const combinedFeed = [...feed, ...workoutDecorations.feedItems];

  return {
    view: parseCoachSurfaceResponse({
      generatedAt: new Date().toISOString(),
      sessionKey: resolvedSessionKey,
      sessionId: currentSessionId,
      header: {
        title: 'Coach',
        subtitle: activeRun ? 'Working on your latest turn' : 'One calm surface for training, planning, and check-ins'
      },
      activeRun,
      workout,
      pinnedCard: workoutDecorations.pinnedCard,
      feed: combinedFeed,
      composer: {
        placeholder: 'Message your coach',
        supportsText: true,
        supportsVoice: true
      },
      quickActions: [
        {
          id: 'start_workout',
          label: 'Start workout',
          icon: 'figure.strengthtraining.traditional',
          triggerType: 'ui.action.start_workout',
          message: 'Start my workout.'
        },
        {
          id: 'check_in',
          label: 'Check in',
          icon: 'bubble.left.and.bubble.right',
          triggerType: 'user.message',
          message: 'Check in with me about today.'
        },
        {
          id: 'plan_today',
          label: 'Plan today',
          icon: 'calendar',
          triggerType: 'user.message',
          message: 'Help me plan today.'
        }
      ]
    }),
    sessionBoundary: {
      sessionKey: sessionState ? sessionState.sessionKey : resolvedSessionKey,
      rotated: sessionState ? sessionState.rotated : false,
      rotationReason: sessionState ? sessionState.rotationReason : null,
      previousSessionId: sessionState ? sessionState.previousSessionId : null
    }
  };
}

module.exports = {
  buildCoachSurfaceView
};
