-- Trainer Program Schema (Phase D)
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  program_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  active_from TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trainer_program_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES trainer_programs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('draft', 'edit', 'review', 'approve', 'activate')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_active_program (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES trainer_programs(id) ON DELETE CASCADE,
  program_version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_programs_user ON trainer_programs(user_id);

ALTER TABLE trainer_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_program_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_active_program ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own programs" ON trainer_programs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own programs" ON trainer_programs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own programs" ON trainer_programs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage programs" ON trainer_programs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own program events" ON trainer_program_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_programs
      WHERE trainer_programs.id = trainer_program_events.program_id
      AND trainer_programs.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create program events" ON trainer_program_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_programs
      WHERE trainer_programs.id = trainer_program_events.program_id
      AND trainer_programs.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage program events" ON trainer_program_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own active program" ON trainer_active_program
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own active program" ON trainer_active_program
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage active program" ON trainer_active_program
  FOR ALL USING (auth.role() = 'service_role');
