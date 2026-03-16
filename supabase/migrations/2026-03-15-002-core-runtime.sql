CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en-US',
  birth_date date,
  sex text,
  weight_unit text NOT NULL DEFAULT 'lb',
  distance_unit text NOT NULL DEFAULT 'mi',
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_weight_unit_check CHECK (weight_unit IN ('lb', 'kg')),
  CONSTRAINT user_profiles_distance_unit_check CHECK (distance_unit IN ('mi', 'km'))
);

CREATE TABLE IF NOT EXISTS public.user_plan_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'standard',
  heartbeat_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  current_session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  leaf_event_id uuid,
  session_version bigint NOT NULL DEFAULT 0,
  pinned_feed_item_id uuid,
  compaction_count integer NOT NULL DEFAULT 0,
  memory_flush_at timestamptz,
  memory_flush_compaction_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_state_user_session_key_unique UNIQUE (user_id, session_key),
  CONSTRAINT session_state_session_version_check CHECK (session_version >= 0),
  CONSTRAINT session_state_compaction_count_check CHECK (compaction_count >= 0),
  CONSTRAINT session_state_memory_flush_compaction_count_check CHECK (memory_flush_compaction_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid NOT NULL,
  trigger_type text NOT NULL,
  trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  provider_key text,
  model_key text,
  usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled'))
);

CREATE TABLE IF NOT EXISTS public.session_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid NOT NULL,
  parent_event_id uuid REFERENCES public.session_events(event_id) ON DELETE SET NULL,
  seq_num bigint NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL,
  run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_events_seq_num_check CHECK (seq_num > 0),
  CONSTRAINT session_events_unique_seq UNIQUE (user_id, session_key, session_id, seq_num)
);

CREATE TABLE IF NOT EXISTS public.stream_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(run_id) ON DELETE CASCADE,
  seq_num integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stream_events_seq_num_check CHECK (seq_num > 0),
  CONSTRAINT stream_events_unique_seq UNIQUE (run_id, seq_num)
);

CREATE TABLE IF NOT EXISTS public.delivery_outbox (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(run_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_app',
  status text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_outbox_status_check CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'canceled')),
  CONSTRAINT delivery_outbox_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT delivery_outbox_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb,
  status_code integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_state_user ON public.session_state(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_user_created_at ON public.runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user_session_created_at ON public.runs(user_id, session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_user_session_seq ON public.session_events(user_id, session_key, session_id, seq_num);
CREATE INDEX IF NOT EXISTS idx_session_events_run_id ON public.session_events(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_events_idempotency
  ON public.session_events(user_id, session_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_outbox_user_status ON public.delivery_outbox(user_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_expires ON public.idempotency_keys(user_id, expires_at);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_service_role_all"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_plan_settings_select_own"
  ON public.user_plan_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_plan_settings_insert_own"
  ON public.user_plan_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_plan_settings_update_own"
  ON public.user_plan_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_plan_settings_service_role_all"
  ON public.user_plan_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "session_state_select_own"
  ON public.session_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "session_state_service_role_all"
  ON public.session_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "runs_select_own"
  ON public.runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "runs_service_role_all"
  ON public.runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "session_events_select_own"
  ON public.session_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "session_events_service_role_all"
  ON public.session_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stream_events_select_own"
  ON public.stream_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.runs
      WHERE runs.run_id = stream_events.run_id
        AND runs.user_id = auth.uid()
    )
  );

CREATE POLICY "stream_events_service_role_all"
  ON public.stream_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "delivery_outbox_service_role_all"
  ON public.delivery_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "idempotency_keys_service_role_all"
  ON public.idempotency_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_user_profiles ON public.user_profiles;
CREATE TRIGGER set_updated_at_user_profiles
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_user_plan_settings ON public.user_plan_settings;
CREATE TRIGGER set_updated_at_user_plan_settings
BEFORE UPDATE ON public.user_plan_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_session_state ON public.session_state;
CREATE TRIGGER set_updated_at_session_state
BEFORE UPDATE ON public.session_state
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_runs ON public.runs;
CREATE TRIGGER set_updated_at_runs
BEFORE UPDATE ON public.runs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_delivery_outbox ON public.delivery_outbox;
CREATE TRIGGER set_updated_at_delivery_outbox
BEFORE UPDATE ON public.delivery_outbox
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
