-- Stores one generated home insight message per user per local day.

CREATE TABLE IF NOT EXISTS public.trainer_daily_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_date date NOT NULL,
  time_zone text NOT NULL DEFAULT 'UTC',
  message_text text NOT NULL,
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_date)
);

CREATE INDEX IF NOT EXISTS idx_trainer_daily_messages_user_date
  ON public.trainer_daily_messages(user_id, message_date DESC);

CREATE OR REPLACE FUNCTION public.update_trainer_daily_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trainer_daily_messages_updated_at
  ON public.trainer_daily_messages;
CREATE TRIGGER trg_trainer_daily_messages_updated_at
  BEFORE UPDATE ON public.trainer_daily_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_trainer_daily_messages_updated_at();

ALTER TABLE public.trainer_daily_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily messages" ON public.trainer_daily_messages;
CREATE POLICY "Users can view own daily messages" ON public.trainer_daily_messages
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own daily messages" ON public.trainer_daily_messages;
CREATE POLICY "Users can create own daily messages" ON public.trainer_daily_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily messages" ON public.trainer_daily_messages;
CREATE POLICY "Users can update own daily messages" ON public.trainer_daily_messages
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own daily messages" ON public.trainer_daily_messages;
CREATE POLICY "Users can delete own daily messages" ON public.trainer_daily_messages
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage daily messages" ON public.trainer_daily_messages;
CREATE POLICY "Service role can manage daily messages" ON public.trainer_daily_messages
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.trainer_daily_messages TO authenticated;
GRANT ALL ON public.trainer_daily_messages TO service_role;
