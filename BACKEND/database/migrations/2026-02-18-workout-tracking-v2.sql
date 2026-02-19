-- Workout Tracking V2
-- Source-of-truth hierarchy: workout_sessions -> workouts -> workout_exercises
-- Separate telemetry: workout_action_logs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'stopped', 'canceled')),
  coach_mode text NOT NULL DEFAULT 'quiet' CHECK (coach_mode IN ('quiet', 'ringer')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  session_rpe integer CHECK (session_rpe BETWEEN 1 AND 10),
  notes text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  workout_type text,
  planned_duration_min integer,
  actual_duration_min integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_order integer NOT NULL,
  exercise_type text NOT NULL CHECK (exercise_type IN ('reps', 'hold', 'duration', 'intervals')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  payload_json jsonb NOT NULL,
  payload_version integer NOT NULL DEFAULT 1 CHECK (payload_version >= 1),
  exercise_name text NOT NULL,
  exercise_rpe integer CHECK (exercise_rpe BETWEEN 1 AND 10),
  total_reps integer NOT NULL DEFAULT 0,
  volume numeric NOT NULL DEFAULT 0,
  duration_sec integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workout_id, exercise_order)
);

CREATE TABLE IF NOT EXISTS public.workout_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.workout_exercises(id) ON DELETE SET NULL,
  command_id uuid NOT NULL,
  action_type text NOT NULL,
  action_payload_json jsonb NOT NULL,
  source_screen text,
  app_version text,
  device_id text,
  correlation_id text,
  client_timestamp timestamptz,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, command_id)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_workout_sessions_updated_at ON public.workout_sessions;
CREATE TRIGGER update_workout_sessions_updated_at
  BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workouts_updated_at ON public.workouts;
CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workout_exercises_updated_at ON public.workout_exercises;
CREATE TRIGGER update_workout_exercises_updated_at
  BEFORE UPDATE ON public.workout_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_started ON public.workout_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_status ON public.workout_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_workouts_session ON public.workouts(session_id);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_order ON public.workout_exercises(workout_id, exercise_order);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_status ON public.workout_exercises(workout_id, status);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_name ON public.workout_exercises(exercise_name);

CREATE INDEX IF NOT EXISTS idx_workout_action_logs_session_time ON public.workout_action_logs(session_id, server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_workout_action_logs_exercise_time ON public.workout_action_logs(exercise_id, server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_workout_action_logs_user_time ON public.workout_action_logs(user_id, server_timestamp DESC);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own workout_sessions" ON public.workout_sessions;
CREATE POLICY "Users can manage own workout_sessions" ON public.workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage workout_sessions" ON public.workout_sessions;
CREATE POLICY "Service role can manage workout_sessions" ON public.workout_sessions
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own workouts" ON public.workouts;
CREATE POLICY "Users can manage own workouts" ON public.workouts
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      WHERE ws.id = workouts.session_id
        AND ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      WHERE ws.id = workouts.session_id
        AND ws.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage workouts" ON public.workouts;
CREATE POLICY "Service role can manage workouts" ON public.workouts
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own workout_exercises" ON public.workout_exercises;
CREATE POLICY "Users can manage own workout_exercises" ON public.workout_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.workouts w
      JOIN public.workout_sessions ws ON ws.id = w.session_id
      WHERE w.id = workout_exercises.workout_id
        AND ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workouts w
      JOIN public.workout_sessions ws ON ws.id = w.session_id
      WHERE w.id = workout_exercises.workout_id
        AND ws.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage workout_exercises" ON public.workout_exercises;
CREATE POLICY "Service role can manage workout_exercises" ON public.workout_exercises
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage own workout_action_logs" ON public.workout_action_logs;
CREATE POLICY "Users can manage own workout_action_logs" ON public.workout_action_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage workout_action_logs" ON public.workout_action_logs;
CREATE POLICY "Service role can manage workout_action_logs" ON public.workout_action_logs
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.workout_sessions TO authenticated;
GRANT ALL ON public.workouts TO authenticated;
GRANT ALL ON public.workout_exercises TO authenticated;
GRANT ALL ON public.workout_action_logs TO authenticated;

GRANT ALL ON public.workout_sessions TO service_role;
GRANT ALL ON public.workouts TO service_role;
GRANT ALL ON public.workout_exercises TO service_role;
GRANT ALL ON public.workout_action_logs TO service_role;
