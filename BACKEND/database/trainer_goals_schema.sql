-- Trainer Goals Schema (Phase C)
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_goal_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deferred')),
  version INTEGER NOT NULL DEFAULT 1,
  contract_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trainer_goal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES trainer_goal_contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('draft', 'edit', 'approve')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_goal_contracts_user ON trainer_goal_contracts(user_id);

ALTER TABLE trainer_goal_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_goal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goal contracts" ON trainer_goal_contracts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own goal contracts" ON trainer_goal_contracts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goal contracts" ON trainer_goal_contracts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage goal contracts" ON trainer_goal_contracts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own goal events" ON trainer_goal_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_goal_contracts
      WHERE trainer_goal_contracts.id = trainer_goal_events.goal_id
      AND trainer_goal_contracts.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create own goal events" ON trainer_goal_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_goal_contracts
      WHERE trainer_goal_contracts.id = trainer_goal_events.goal_id
      AND trainer_goal_contracts.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage goal events" ON trainer_goal_events
  FOR ALL USING (auth.role() = 'service_role');
