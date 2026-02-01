-- Trainer Monitoring Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  report_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_adjustment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'safety')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_program_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES trainer_programs(id) ON DELETE CASCADE,
  patch_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trainer_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_adjustment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_program_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly reports" ON trainer_weekly_reports
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own weekly reports" ON trainer_weekly_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage weekly reports" ON trainer_weekly_reports
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own adjustments" ON trainer_adjustment_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own adjustments" ON trainer_adjustment_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage adjustments" ON trainer_adjustment_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own program patches" ON trainer_program_patches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_programs
      WHERE trainer_programs.id = trainer_program_patches.program_id
      AND trainer_programs.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create program patches" ON trainer_program_patches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_programs
      WHERE trainer_programs.id = trainer_program_patches.program_id
      AND trainer_programs.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage program patches" ON trainer_program_patches
  FOR ALL USING (auth.role() = 'service_role');
