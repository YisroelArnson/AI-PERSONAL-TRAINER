ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_state_version_check;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_state_version_check
  CHECK (state_version >= 1);
