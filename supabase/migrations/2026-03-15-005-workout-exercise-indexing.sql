-- File overview:
-- Applies the workout-exercise-indexing database changes for the Supabase schema.
--
-- This file is primarily composed of schema changes, data movement, or raw SQL statements rather than database routines.

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS exercise_key text,
  ADD COLUMN IF NOT EXISTS exercise_name_raw text,
  ADD COLUMN IF NOT EXISTS exercise_name_normalized text,
  ADD COLUMN IF NOT EXISTS index_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS index_dirty boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS index_dirty_reason text,
  ADD COLUMN IF NOT EXISTS last_indexed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_indexed_source_hash text,
  ADD COLUMN IF NOT EXISTS exercise_instance_doc_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workout_exercises_index_status_check'
  ) THEN
    ALTER TABLE public.workout_exercises
      ADD CONSTRAINT workout_exercises_index_status_check
      CHECK (index_status IN ('pending', 'processing', 'indexed', 'failed'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workout_exercises_exercise_instance_doc_id_fkey'
  ) THEN
    ALTER TABLE public.workout_exercises
      ADD CONSTRAINT workout_exercises_exercise_instance_doc_id_fkey
      FOREIGN KEY (exercise_instance_doc_id)
      REFERENCES public.memory_docs(doc_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise_key
  ON public.workout_exercises(exercise_key);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_name_normalized
  ON public.workout_exercises(exercise_name_normalized);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_doc_id
  ON public.workout_exercises(exercise_instance_doc_id);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_dirty_terminal
  ON public.workout_exercises(index_status, completed_at, workout_session_id)
  WHERE index_dirty = true;

DROP TRIGGER IF EXISTS set_updated_at_workout_exercises ON public.workout_exercises;
CREATE TRIGGER set_updated_at_workout_exercises
BEFORE UPDATE ON public.workout_exercises
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_workout_sets ON public.workout_sets;
CREATE TRIGGER set_updated_at_workout_sets
BEFORE UPDATE ON public.workout_sets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
