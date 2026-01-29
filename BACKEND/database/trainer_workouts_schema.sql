-- Trainer Workout Sessions Schema (Phase E)
-- Created: January 29, 2026
-- Purpose: Workout coach mode sessions, instances, events, and summaries

-- =============================================================================
-- WORKOUT SESSIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS trainer_workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
    'in_progress',
    'completed',
    'stopped',
    'canceled'
  )),

  coach_mode TEXT NOT NULL DEFAULT 'quiet' CHECK (coach_mode IN ('quiet', 'ringer')),

  -- Optional links
  planned_session_id UUID NULL,
  calendar_event_id UUID NULL,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- WORKOUT INSTANCES (VERSIONED)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trainer_workout_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_workout_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  instance_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, version)
);

-- =============================================================================
-- WORKOUT EVENTS (APPEND-ONLY)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trainer_workout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_workout_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_started',
    'instance_generated',
    'action',
    'log_set',
    'log_interval',
    'timer',
    'coach_message',
    'safety_flag',
    'session_completed',
    'error'
  )),

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,

  UNIQUE(session_id, sequence_number)
);

-- =============================================================================
-- WORKOUT LOGS (FINAL MATERIALIZED)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trainer_workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_workout_sessions(id) ON DELETE CASCADE,
  log_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id)
);

-- =============================================================================
-- SESSION SUMMARIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS trainer_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_workout_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, version)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_trainer_workout_sessions_user_id ON trainer_workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_workout_sessions_status ON trainer_workout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trainer_workout_sessions_updated_at ON trainer_workout_sessions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trainer_workout_instances_session ON trainer_workout_instances(session_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_workout_events_session ON trainer_workout_events(session_id);
CREATE INDEX IF NOT EXISTS idx_trainer_workout_events_sequence ON trainer_workout_events(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_trainer_workout_events_type ON trainer_workout_events(event_type);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE trainer_workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_workout_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_workout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_session_summaries ENABLE ROW LEVEL SECURITY;

-- Policies for trainer_workout_sessions
CREATE POLICY "Users can view own workout sessions" ON trainer_workout_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workout sessions" ON trainer_workout_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout sessions" ON trainer_workout_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage workout sessions" ON trainer_workout_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for trainer_workout_instances
CREATE POLICY "Users can view own workout instances" ON trainer_workout_instances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_instances.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workout instances in own sessions" ON trainer_workout_instances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_instances.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage workout instances" ON trainer_workout_instances
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for trainer_workout_events
CREATE POLICY "Users can view own workout events" ON trainer_workout_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_events.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workout events in own sessions" ON trainer_workout_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_events.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage workout events" ON trainer_workout_events
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for trainer_workout_logs
CREATE POLICY "Users can view own workout logs" ON trainer_workout_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_logs.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workout logs in own sessions" ON trainer_workout_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_workout_logs.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage workout logs" ON trainer_workout_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for trainer_session_summaries
CREATE POLICY "Users can view own session summaries" ON trainer_session_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_session_summaries.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create session summaries in own sessions" ON trainer_session_summaries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_workout_sessions
      WHERE trainer_workout_sessions.id = trainer_session_summaries.session_id
      AND trainer_workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage session summaries" ON trainer_session_summaries
  FOR ALL USING (auth.role() = 'service_role');
