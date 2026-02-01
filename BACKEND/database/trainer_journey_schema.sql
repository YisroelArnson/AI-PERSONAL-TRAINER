-- Trainer Journey State Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_journey_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'not_started' CHECK (state IN (
    'not_started',
    'intake_in_progress',
    'intake_complete',
    'assessment_in_progress',
    'assessment_complete',
    'goals_in_progress',
    'goals_complete',
    'program_design_in_progress',
    'program_active',
    'program_paused',
    'program_needs_attention'
  )),
  intake_status TEXT NOT NULL DEFAULT 'not_started' CHECK (intake_status IN ('not_started', 'in_progress', 'complete', 'deferred')),
  assessment_status TEXT NOT NULL DEFAULT 'not_started' CHECK (assessment_status IN ('not_started', 'in_progress', 'complete', 'deferred')),
  goals_status TEXT NOT NULL DEFAULT 'not_started' CHECK (goals_status IN ('not_started', 'in_progress', 'complete', 'deferred')),
  program_status TEXT NOT NULL DEFAULT 'not_started' CHECK (program_status IN ('not_started', 'in_progress', 'complete', 'active', 'paused')),
  monitoring_status TEXT NOT NULL DEFAULT 'not_started' CHECK (monitoring_status IN ('not_started', 'active')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trainer_journey_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journey state" ON trainer_journey_state
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own journey state" ON trainer_journey_state
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can create own journey state" ON trainer_journey_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage journey state" ON trainer_journey_state
  FOR ALL USING (auth.role() = 'service_role');
