const { getSupabaseAdminClient } = require('../../infra/supabase/client');
const { parseCoachSurfaceResponse } = require('../../gateway/schemas/coach-surface.schema');
const { buildWorkoutSurfaceDecorations } = require('./coach-surface-card-renderer.service');
const { getCurrentWorkoutState } = require('./workout-state.service');

const DEFAULT_FEED_LIMIT = 40;

function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

function canonicalSessionKey(userId, sessionKey) {
  const raw = sessionKey && sessionKey.trim() ? sessionKey.trim() : `user:${userId}:main`;
  return raw.toLowerCase();
}

function mapFeedItem(event) {
  const payload = event.payload || {};
  const metadata = payload.metadata || {};
  const text = payload.text || payload.message || '';

  if (!text || event.event_type === 'app.opened' || metadata.hiddenInFeed === true) {
    return null;
  }

  return {
    id: event.event_id,
    kind: 'message',
    role: event.actor === 'assistant' ? 'assistant' : 'user',
    text,
    eventType: event.event_type,
    runId: event.run_id,
    seqNum: event.seq_num,
    occurredAt: event.occurred_at
  };
}

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

function getRunSurfaceVisibility(run) {
  const triggerPayload = run && typeof run.trigger_payload === 'object' ? run.trigger_payload : {};
  const metadata = triggerPayload && typeof triggerPayload.metadata === 'object'
    ? triggerPayload.metadata
    : {};

  return metadata.runVisibility === 'background' ? 'background' : 'foreground';
}

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

  return [...data].reverse().map(mapFeedItem).filter(Boolean);
}

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
