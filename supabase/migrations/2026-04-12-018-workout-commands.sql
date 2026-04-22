-- File overview:
-- Applies the workout-commands database changes for the Supabase schema.
--
-- This file is primarily composed of schema changes, data movement, or raw SQL statements rather than database routines.

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS last_command_sequence bigint NOT NULL DEFAULT 0;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_last_command_sequence_check;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_last_command_sequence_check
  CHECK (last_command_sequence >= 0);

CREATE TABLE IF NOT EXISTS public.workout_commands (
  workout_command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid,
  workout_session_id uuid NOT NULL REFERENCES public.workout_sessions(workout_session_id) ON DELETE CASCADE,
  origin_actor text NOT NULL,
  origin_device_id text,
  origin_run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  origin_occurred_at timestamptz NOT NULL DEFAULT now(),
  command_type text NOT NULL,
  client_sequence bigint,
  base_state_version bigint,
  server_sequence bigint NOT NULL,
  status text NOT NULL,
  resolution text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_workout jsonb,
  agent_follow_up jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_state_version bigint,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_commands_origin_actor_check
    CHECK (origin_actor IN ('user_ui', 'agent', 'system')),
  CONSTRAINT workout_commands_status_check
    CHECK (status IN ('accepted', 'replayed', 'noop', 'rejected')),
  CONSTRAINT workout_commands_resolution_check
    CHECK (resolution IN (
      'applied',
      'duplicate',
      'noop_terminal',
      'stale',
      'conflict_user_priority',
      'invalid_target',
      'not_live',
      'rejected'
    )),
  CONSTRAINT workout_commands_server_sequence_check
    CHECK (server_sequence >= 1),
  CONSTRAINT workout_commands_client_sequence_check
    CHECK (client_sequence IS NULL OR client_sequence >= 0),
  CONSTRAINT workout_commands_base_state_version_check
    CHECK (base_state_version IS NULL OR base_state_version >= 0),
  CONSTRAINT workout_commands_applied_state_version_check
    CHECK (applied_state_version IS NULL OR applied_state_version >= 0),
  CONSTRAINT workout_commands_user_session_command_unique
    UNIQUE (user_id, workout_session_id, command_id),
  CONSTRAINT workout_commands_user_session_sequence_unique
    UNIQUE (user_id, workout_session_id, server_sequence)
);

CREATE INDEX IF NOT EXISTS idx_workout_commands_session_applied_at
  ON public.workout_commands(user_id, workout_session_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_commands_user_origin_applied_at
  ON public.workout_commands(user_id, workout_session_id, origin_actor, applied_at DESC);

ALTER TABLE public.workout_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workout_commands_select_own"
  ON public.workout_commands
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
  );

CREATE POLICY "workout_commands_service_role_all"
  ON public.workout_commands
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_workout_commands ON public.workout_commands;
CREATE TRIGGER set_updated_at_workout_commands
BEFORE UPDATE ON public.workout_commands
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
