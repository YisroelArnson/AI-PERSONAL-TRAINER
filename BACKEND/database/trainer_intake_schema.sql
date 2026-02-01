-- Trainer Intake Schema (Phase A)
-- Created: January 30, 2026
-- Purpose: Intake sessions, events, checklist, and summaries

CREATE TABLE IF NOT EXISTS trainer_intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'confirmed', 'archived')),
  current_topic TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_intake_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_intake_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'assistant_message',
    'user_answer',
    'checklist_update',
    'progress_update',
    'safety_flag',
    'summary_generated',
    'error'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,
  UNIQUE(session_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS trainer_intake_checklist (
  session_id UUID PRIMARY KEY REFERENCES trainer_intake_sessions(id) ON DELETE CASCADE,
  items_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_intake_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_intake_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  summary_json JSONB NOT NULL,
  confirmed_at TIMESTAMPTZ,
  source_event_sequence INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_trainer_intake_sessions_user_id ON trainer_intake_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_intake_sessions_status ON trainer_intake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trainer_intake_events_session ON trainer_intake_events(session_id, sequence_number);

ALTER TABLE trainer_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_intake_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_intake_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_intake_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intake sessions" ON trainer_intake_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own intake sessions" ON trainer_intake_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own intake sessions" ON trainer_intake_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage intake sessions" ON trainer_intake_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own intake events" ON trainer_intake_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_events.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create own intake events" ON trainer_intake_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_events.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage intake events" ON trainer_intake_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own intake checklist" ON trainer_intake_checklist
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_checklist.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create intake checklist" ON trainer_intake_checklist
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_checklist.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update intake checklist" ON trainer_intake_checklist
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_checklist.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage intake checklist" ON trainer_intake_checklist
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own intake summaries" ON trainer_intake_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_summaries.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create intake summaries" ON trainer_intake_summaries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_intake_sessions
      WHERE trainer_intake_sessions.id = trainer_intake_summaries.session_id
      AND trainer_intake_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage intake summaries" ON trainer_intake_summaries
  FOR ALL USING (auth.role() = 'service_role');
