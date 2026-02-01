-- Trainer User Memory Schema
-- Created: January 30, 2026

CREATE TABLE IF NOT EXISTS trainer_user_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  confidence TEXT DEFAULT 'med',
  sensitivity TEXT DEFAULT 'normal',
  source TEXT,
  source_event_id UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trainer_user_memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES trainer_user_memory_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_memory_user_key ON trainer_user_memory_items(user_id, key);

ALTER TABLE trainer_user_memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_user_memory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory" ON trainer_user_memory_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own memory" ON trainer_user_memory_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memory" ON trainer_user_memory_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage memory" ON trainer_user_memory_items
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own memory events" ON trainer_user_memory_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainer_user_memory_items
      WHERE trainer_user_memory_items.id = trainer_user_memory_events.memory_id
      AND trainer_user_memory_items.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create own memory events" ON trainer_user_memory_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trainer_user_memory_items
      WHERE trainer_user_memory_items.id = trainer_user_memory_events.memory_id
      AND trainer_user_memory_items.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role can manage memory events" ON trainer_user_memory_events
  FOR ALL USING (auth.role() = 'service_role');
