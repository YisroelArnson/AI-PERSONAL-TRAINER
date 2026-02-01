-- Trainer Assessment Schema (Phase B)
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_assessment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  current_step_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_assessment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_assessment_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'instruction_shown',
    'user_answer',
    'step_result',
    'skip',
    'safety_flag',
    'baseline_generated',
    'error'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,
  UNIQUE(session_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS trainer_assessment_step_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_assessment_sessions(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_assessment_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainer_assessment_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  baseline_json JSONB NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user ON trainer_assessment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_events_session ON trainer_assessment_events(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_assessment_step_results_session ON trainer_assessment_step_results(session_id, step_id);

ALTER TABLE trainer_assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_assessment_step_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_assessment_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assessment sessions" ON trainer_assessment_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own assessment sessions" ON trainer_assessment_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assessment sessions" ON trainer_assessment_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage assessment sessions" ON trainer_assessment_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own assessment events" ON trainer_assessment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_events.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create own assessment events" ON trainer_assessment_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_events.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage assessment events" ON trainer_assessment_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own assessment results" ON trainer_assessment_step_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_step_results.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create assessment results" ON trainer_assessment_step_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_step_results.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage assessment results" ON trainer_assessment_step_results
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own assessment baselines" ON trainer_assessment_baselines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_baselines.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create assessment baselines" ON trainer_assessment_baselines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_assessment_sessions
      WHERE trainer_assessment_sessions.id = trainer_assessment_baselines.session_id
      AND trainer_assessment_sessions.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage assessment baselines" ON trainer_assessment_baselines
  FOR ALL USING (auth.role() = 'service_role');
