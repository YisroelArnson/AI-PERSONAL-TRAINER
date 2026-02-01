-- Trainer Check-ins Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_type TEXT NOT NULL DEFAULT 'weekly' CHECK (checkin_type IN ('weekly', 'monthly')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'complete', 'skipped')),
  responses_json JSONB DEFAULT '{}'::jsonb,
  summary_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trainer_checkins_user ON trainer_checkins(user_id, created_at DESC);

ALTER TABLE trainer_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins" ON trainer_checkins
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own checkins" ON trainer_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkins" ON trainer_checkins
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage checkins" ON trainer_checkins
  FOR ALL USING (auth.role() = 'service_role');
