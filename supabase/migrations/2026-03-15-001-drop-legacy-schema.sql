-- File overview:
-- Applies the drop-legacy-schema database changes for the Supabase schema.
--
-- This file is primarily composed of schema changes, data movement, or raw SQL statements rather than database routines.

-- Destructive reset for the legacy trainer app schema.
-- This migration is intended for a pre-launch greenfield rebuild.

DROP TABLE IF EXISTS public.agent_session_events CASCADE;
DROP TABLE IF EXISTS public.agent_sessions CASCADE;
DROP TABLE IF EXISTS public.app_user CASCADE;
DROP TABLE IF EXISTS public.exercise_distribution_tracking CASCADE;
DROP TABLE IF EXISTS public.trainer_active_program CASCADE;
DROP TABLE IF EXISTS public.trainer_adjustment_events CASCADE;
DROP TABLE IF EXISTS public.trainer_assessment_baselines CASCADE;
DROP TABLE IF EXISTS public.trainer_assessment_events CASCADE;
DROP TABLE IF EXISTS public.trainer_assessment_sessions CASCADE;
DROP TABLE IF EXISTS public.trainer_assessment_step_results CASCADE;
DROP TABLE IF EXISTS public.trainer_calendar_events CASCADE;
DROP TABLE IF EXISTS public.trainer_checkins CASCADE;
DROP TABLE IF EXISTS public.trainer_daily_messages CASCADE;
DROP TABLE IF EXISTS public.trainer_goal_contracts CASCADE;
DROP TABLE IF EXISTS public.trainer_goal_events CASCADE;
DROP TABLE IF EXISTS public.trainer_intake_checklist CASCADE;
DROP TABLE IF EXISTS public.trainer_intake_events CASCADE;
DROP TABLE IF EXISTS public.trainer_intake_sessions CASCADE;
DROP TABLE IF EXISTS public.trainer_intake_summaries CASCADE;
DROP TABLE IF EXISTS public.trainer_journey_state CASCADE;
DROP TABLE IF EXISTS public.trainer_measurements CASCADE;
DROP TABLE IF EXISTS public.trainer_planned_sessions CASCADE;
DROP TABLE IF EXISTS public.trainer_program_events CASCADE;
DROP TABLE IF EXISTS public.trainer_program_patches CASCADE;
DROP TABLE IF EXISTS public.trainer_programs CASCADE;
DROP TABLE IF EXISTS public.trainer_session_summaries CASCADE;
DROP TABLE IF EXISTS public.trainer_structured_intake CASCADE;
DROP TABLE IF EXISTS public.trainer_user_memory_events CASCADE;
DROP TABLE IF EXISTS public.trainer_user_memory_items CASCADE;
DROP TABLE IF EXISTS public.trainer_weekly_reports CASCADE;
DROP TABLE IF EXISTS public.trainer_weights_profiles CASCADE;
DROP TABLE IF EXISTS public.trainer_workout_events CASCADE;
DROP TABLE IF EXISTS public.trainer_workout_instances CASCADE;
DROP TABLE IF EXISTS public.trainer_workout_logs CASCADE;
DROP TABLE IF EXISTS public.trainer_workout_sessions CASCADE;
DROP TABLE IF EXISTS public.user_locations CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.workout_history CASCADE;

DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
