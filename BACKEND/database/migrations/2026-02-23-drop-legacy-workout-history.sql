-- Remove legacy per-exercise workout history table.
-- Source of truth is trainer_workout_sessions + related trainer_workout_* tables.

DROP TABLE IF EXISTS public.workout_history CASCADE;
