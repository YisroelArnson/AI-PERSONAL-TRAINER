-- Trainer Calendar Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'workout' CHECK (event_type IN ('workout', 'rest', 'checkin', 'assessment', 'note')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'skipped', 'canceled')),
  source TEXT DEFAULT 'program_projection',
  user_modified BOOLEAN DEFAULT false,
  linked_program_id UUID,
  linked_program_version INTEGER,
  linked_planned_session_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_planned_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id UUID NOT NULL REFERENCES trainer_calendar_events(id) ON DELETE CASCADE,
  intent_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_calendar_events_user ON trainer_calendar_events(user_id, start_at DESC);

ALTER TABLE trainer_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_planned_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar events" ON trainer_calendar_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own calendar events" ON trainer_calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar events" ON trainer_calendar_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage calendar events" ON trainer_calendar_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own planned sessions" ON trainer_planned_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own planned sessions" ON trainer_planned_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own planned sessions" ON trainer_planned_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage planned sessions" ON trainer_planned_sessions
  FOR ALL USING (auth.role() = 'service_role');
