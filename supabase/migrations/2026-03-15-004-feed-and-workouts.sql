-- File overview:
-- Applies the feed-and-workouts database changes for the Supabase schema.
--
-- This file is primarily composed of schema changes, data movement, or raw SQL statements rather than database routines.

CREATE TABLE IF NOT EXISTS public.feed_items (
  feed_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid NOT NULL,
  run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  source_event_id uuid REFERENCES public.session_events(event_id) ON DELETE SET NULL,
  ordinal bigint NOT NULL,
  role text NOT NULL,
  item_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_items_ordinal_check CHECK (ordinal > 0),
  CONSTRAINT feed_items_user_session_ordinal_unique UNIQUE (user_id, session_key, ordinal)
);

ALTER TABLE public.session_state
  ADD CONSTRAINT session_state_leaf_event_id_fk
  FOREIGN KEY (leaf_event_id)
  REFERENCES public.session_events(event_id)
  ON DELETE SET NULL;

ALTER TABLE public.session_state
  ADD CONSTRAINT session_state_pinned_feed_item_id_fk
  FOREIGN KEY (pinned_feed_item_id)
  REFERENCES public.feed_items(feed_item_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.exercise_definitions (
  exercise_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  movement_pattern text,
  primary_muscles text[] NOT NULL DEFAULT '{}'::text[],
  secondary_muscles text[] NOT NULL DEFAULT '{}'::text[],
  equipment_required text[] NOT NULL DEFAULT '{}'::text[],
  equipment_optional text[] NOT NULL DEFAULT '{}'::text[],
  difficulty text,
  unilateral boolean NOT NULL DEFAULT false,
  default_tracking_mode text,
  contraindications text[] NOT NULL DEFAULT '{}'::text[],
  coaching_cues text[] NOT NULL DEFAULT '{}'::text[],
  regression_slugs text[] NOT NULL DEFAULT '{}'::text[],
  progression_slugs text[] NOT NULL DEFAULT '{}'::text[],
  substitution_tags text[] NOT NULL DEFAULT '{}'::text[],
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workout_sessions (
  workout_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  originating_run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  status text NOT NULL,
  current_phase text NOT NULL,
  title text,
  guidance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_exercise_index integer,
  current_set_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_sessions_status_check CHECK (status IN ('queued', 'in_progress', 'paused', 'completed', 'canceled', 'abandoned')),
  CONSTRAINT workout_sessions_current_exercise_index_check CHECK (current_exercise_index IS NULL OR current_exercise_index >= 0),
  CONSTRAINT workout_sessions_current_set_index_check CHECK (current_set_index IS NULL OR current_set_index >= 0)
);

CREATE TABLE IF NOT EXISTS public.workout_exercises (
  workout_exercise_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_id uuid NOT NULL REFERENCES public.workout_sessions(workout_session_id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.exercise_definitions(exercise_id) ON DELETE SET NULL,
  order_index integer NOT NULL,
  status text NOT NULL,
  prescription_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  coach_message text,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT workout_exercises_order_index_check CHECK (order_index >= 0),
  CONSTRAINT workout_exercises_status_check CHECK (status IN ('pending', 'active', 'completed', 'skipped', 'canceled')),
  CONSTRAINT workout_exercises_session_order_unique UNIQUE (workout_session_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.workout_sets (
  workout_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES public.workout_exercises(workout_exercise_id) ON DELETE CASCADE,
  set_index integer NOT NULL,
  status text NOT NULL,
  prescribed_reps integer,
  prescribed_load numeric,
  prescribed_duration_sec integer,
  prescribed_distance_m integer,
  prescribed_rpe numeric,
  actual_reps integer,
  actual_load numeric,
  actual_duration_sec integer,
  actual_distance_m integer,
  actual_rpe numeric,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT workout_sets_set_index_check CHECK (set_index >= 0),
  CONSTRAINT workout_sets_status_check CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
  CONSTRAINT workout_sets_reps_check CHECK (
    (prescribed_reps IS NULL OR prescribed_reps >= 0)
    AND (actual_reps IS NULL OR actual_reps >= 0)
  ),
  CONSTRAINT workout_sets_duration_check CHECK (
    (prescribed_duration_sec IS NULL OR prescribed_duration_sec >= 0)
    AND (actual_duration_sec IS NULL OR actual_duration_sec >= 0)
  ),
  CONSTRAINT workout_sets_distance_check CHECK (
    (prescribed_distance_m IS NULL OR prescribed_distance_m >= 0)
    AND (actual_distance_m IS NULL OR actual_distance_m >= 0)
  ),
  CONSTRAINT workout_sets_unique_per_exercise UNIQUE (workout_exercise_id, set_index)
);

CREATE TABLE IF NOT EXISTS public.workout_adjustments (
  adjustment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES public.workout_exercises(workout_exercise_id) ON DELETE CASCADE,
  set_index integer,
  adjustment_type text NOT NULL,
  source text NOT NULL,
  reason text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_adjustments_set_index_check CHECK (set_index IS NULL OR set_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_feed_items_user_created_at ON public.feed_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_user_session_ordinal ON public.feed_items(user_id, session_key, ordinal);
CREATE INDEX IF NOT EXISTS idx_exercise_definitions_active_name ON public.exercise_definitions(active, name);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_updated_at ON public.workout_sessions(user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_sessions_one_live_per_user
  ON public.workout_sessions(user_id)
  WHERE status IN ('queued', 'in_progress', 'paused');
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_order ON public.workout_exercises(workout_session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_set ON public.workout_sets(workout_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_workout_adjustments_exercise_created_at ON public.workout_adjustments(workout_exercise_id, created_at DESC);

ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_items_select_own"
  ON public.feed_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "feed_items_service_role_all"
  ON public.feed_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "exercise_definitions_select_authenticated"
  ON public.exercise_definitions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "exercise_definitions_service_role_all"
  ON public.exercise_definitions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workout_sessions_select_own"
  ON public.workout_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "workout_sessions_service_role_all"
  ON public.workout_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workout_exercises_select_own"
  ON public.workout_exercises
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_sessions
      WHERE workout_sessions.workout_session_id = workout_exercises.workout_session_id
        AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_service_role_all"
  ON public.workout_exercises
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workout_sets_select_own"
  ON public.workout_sets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises
      JOIN public.workout_sessions
        ON workout_sessions.workout_session_id = workout_exercises.workout_session_id
      WHERE workout_exercises.workout_exercise_id = workout_sets.workout_exercise_id
        AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_service_role_all"
  ON public.workout_sets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workout_adjustments_select_own"
  ON public.workout_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises
      JOIN public.workout_sessions
        ON workout_sessions.workout_session_id = workout_exercises.workout_session_id
      WHERE workout_exercises.workout_exercise_id = workout_adjustments.workout_exercise_id
        AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_adjustments_service_role_all"
  ON public.workout_adjustments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_feed_items ON public.feed_items;
CREATE TRIGGER set_updated_at_feed_items
BEFORE UPDATE ON public.feed_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_exercise_definitions ON public.exercise_definitions;
CREATE TRIGGER set_updated_at_exercise_definitions
BEFORE UPDATE ON public.exercise_definitions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_workout_sessions ON public.workout_sessions;
CREATE TRIGGER set_updated_at_workout_sessions
BEFORE UPDATE ON public.workout_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
