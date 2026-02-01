-- Trainer Measurements Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'user_manual',
  source_detail TEXT,
  notes TEXT,
  supersedes_id UUID
);

CREATE INDEX IF NOT EXISTS idx_trainer_measurements_user ON trainer_measurements(user_id, measured_at DESC);

ALTER TABLE trainer_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own measurements" ON trainer_measurements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own measurements" ON trainer_measurements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage measurements" ON trainer_measurements
  FOR ALL USING (auth.role() = 'service_role');
