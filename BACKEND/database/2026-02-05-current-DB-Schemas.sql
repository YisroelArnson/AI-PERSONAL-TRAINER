-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.agent_session_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['user_message'::text, 'tool_call'::text, 'tool_result'::text, 'llm_request'::text, 'llm_response'::text, 'knowledge'::text, 'error'::text, 'checkpoint'::text, 'artifact'::text, 'model_comparison'::text])),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  duration_ms integer,
  data jsonb NOT NULL,
  model_id text,
  CONSTRAINT agent_session_events_pkey PRIMARY KEY (id),
  CONSTRAINT agent_session_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.agent_sessions(id)
);
CREATE TABLE public.agent_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  context_start_sequence integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  cached_tokens integer DEFAULT 0,
  total_cost_cents numeric DEFAULT 0,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'error'::text])),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT agent_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT agent_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.app_user (
  user_id uuid NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text,
  last_name text,
  CONSTRAINT app_user_pkey PRIMARY KEY (user_id),
  CONSTRAINT app_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.body_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  sex text CHECK ((sex = ANY (ARRAY['male'::text, 'female'::text, 'unspecified'::text])) OR sex IS NULL),
  dob date,
  height_cm bigint,
  weight_kg bigint,
  body_fat_pct bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT body_stats_pkey PRIMARY KEY (id),
  CONSTRAINT measurement_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id)
);
CREATE TABLE public.exercise_distribution_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tracking_started_at timestamp with time zone NOT NULL,
  last_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  total_exercises_count integer NOT NULL DEFAULT 0,
  category_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  muscle_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exercise_distribution_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT exercise_distribution_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.preferences (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  type text NOT NULL,
  description text NOT NULL,
  user_transcription text,
  recommendations_guidance text,
  expire_time timestamp with time zone,
  delete_after_call boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preferences_pkey PRIMARY KEY (id),
  CONSTRAINT preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.preset_category (
  id bigint NOT NULL DEFAULT nextval('preset_category_id_seq'::regclass),
  category text NOT NULL UNIQUE,
  label text NOT NULL,
  units USER-DEFINED NOT NULL,
  group_key text,
  group_label text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preset_category_pkey PRIMARY KEY (id)
);
CREATE TABLE public.preset_muscle (
  id bigint NOT NULL DEFAULT nextval('preset_muscle_id_seq'::regclass),
  muscle text NOT NULL UNIQUE,
  label text NOT NULL,
  body_region text,
  group_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preset_muscle_pkey PRIMARY KEY (id)
);
CREATE TABLE public.trainer_active_program (
  user_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_version integer NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_active_program_pkey PRIMARY KEY (user_id),
  CONSTRAINT trainer_active_program_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT trainer_active_program_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.trainer_programs(id)
);
CREATE TABLE public.trainer_adjustment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  severity text NOT NULL DEFAULT 'minor'::text CHECK (severity = ANY (ARRAY['minor'::text, 'major'::text, 'safety'::text])),
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_adjustment_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_adjustment_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_assessment_baselines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  baseline_json jsonb NOT NULL,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_assessment_baselines_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_assessment_baselines_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_assessment_sessions(id)
);
CREATE TABLE public.trainer_assessment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['instruction_shown'::text, 'user_answer'::text, 'step_result'::text, 'skip'::text, 'safety_flag'::text, 'baseline_generated'::text, 'error'::text])),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  CONSTRAINT trainer_assessment_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_assessment_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_assessment_sessions(id)
);
CREATE TABLE public.trainer_assessment_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'archived'::text])),
  current_step_id text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_assessment_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_assessment_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_assessment_step_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  step_id text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_assessment_step_results_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_assessment_step_results_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_assessment_sessions(id)
);
CREATE TABLE public.trainer_calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'workout'::text CHECK (event_type = ANY (ARRAY['workout'::text, 'rest'::text, 'checkin'::text, 'assessment'::text, 'note'::text])),
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone,
  title text,
  status text NOT NULL DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'skipped'::text, 'canceled'::text])),
  source text DEFAULT 'program_projection'::text,
  user_modified boolean DEFAULT false,
  linked_program_id uuid,
  linked_program_version integer,
  linked_planned_session_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  checkin_type text NOT NULL DEFAULT 'weekly'::text CHECK (checkin_type = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'complete'::text, 'skipped'::text])),
  responses_json jsonb DEFAULT '{}'::jsonb,
  summary_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT trainer_checkins_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_goal_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'deferred'::text])),
  version integer NOT NULL DEFAULT 1,
  contract_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  CONSTRAINT trainer_goal_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_goal_contracts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_goal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['draft'::text, 'edit'::text, 'approve'::text])),
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_goal_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_goal_events_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.trainer_goal_contracts(id)
);
CREATE TABLE public.trainer_intake_checklist (
  session_id uuid NOT NULL,
  items_json jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_intake_checklist_pkey PRIMARY KEY (session_id),
  CONSTRAINT trainer_intake_checklist_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_intake_sessions(id)
);
CREATE TABLE public.trainer_intake_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['assistant_message'::text, 'user_answer'::text, 'checklist_update'::text, 'progress_update'::text, 'safety_flag'::text, 'summary_generated'::text, 'error'::text])),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  CONSTRAINT trainer_intake_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_intake_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_intake_sessions(id)
);
CREATE TABLE public.trainer_intake_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'confirmed'::text, 'archived'::text])),
  current_topic text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_intake_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_intake_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_intake_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  summary_json jsonb NOT NULL,
  confirmed_at timestamp with time zone,
  source_event_sequence integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_intake_summaries_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_intake_summaries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_intake_sessions(id)
);
CREATE TABLE public.trainer_journey_state (
  user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'not_started'::text CHECK (state = ANY (ARRAY['not_started'::text, 'intake_in_progress'::text, 'intake_complete'::text, 'assessment_in_progress'::text, 'assessment_complete'::text, 'goals_in_progress'::text, 'goals_complete'::text, 'program_design_in_progress'::text, 'program_active'::text, 'program_paused'::text, 'program_needs_attention'::text])),
  intake_status text NOT NULL DEFAULT 'not_started'::text CHECK (intake_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text, 'deferred'::text])),
  assessment_status text NOT NULL DEFAULT 'not_started'::text CHECK (assessment_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text, 'deferred'::text])),
  goals_status text NOT NULL DEFAULT 'not_started'::text CHECK (goals_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text, 'deferred'::text])),
  program_status text NOT NULL DEFAULT 'not_started'::text CHECK (program_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text, 'active'::text, 'paused'::text])),
  monitoring_status text NOT NULL DEFAULT 'not_started'::text CHECK (monitoring_status = ANY (ARRAY['not_started'::text, 'active'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_journey_state_pkey PRIMARY KEY (user_id),
  CONSTRAINT trainer_journey_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  measurement_type text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  measured_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  source text DEFAULT 'user_manual'::text,
  source_detail text,
  notes text,
  supersedes_id uuid,
  CONSTRAINT trainer_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_planned_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calendar_event_id uuid NOT NULL,
  intent_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_planned_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_planned_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT trainer_planned_sessions_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES public.trainer_calendar_events(id)
);
CREATE TABLE public.trainer_program_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['draft'::text, 'edit'::text, 'review'::text, 'approve'::text, 'activate'::text])),
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_program_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_program_events_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.trainer_programs(id)
);
CREATE TABLE public.trainer_program_patches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  patch_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_program_patches_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_program_patches_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.trainer_programs(id)
);
CREATE TABLE public.trainer_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'active'::text, 'archived'::text])),
  version integer NOT NULL DEFAULT 1,
  program_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  active_from timestamp with time zone,
  CONSTRAINT trainer_programs_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_programs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_session_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  summary_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_session_summaries_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_session_summaries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_workout_sessions(id)
);
CREATE TABLE public.trainer_user_memory_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL,
  event_type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_user_memory_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_user_memory_events_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES public.trainer_user_memory_items(id)
);
CREATE TABLE public.trainer_user_memory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_type text NOT NULL,
  key text NOT NULL,
  value_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text])),
  confidence text DEFAULT 'med'::text,
  sensitivity text DEFAULT 'normal'::text,
  source text,
  source_event_id uuid,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_confirmed_at timestamp with time zone,
  CONSTRAINT trainer_user_memory_items_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_user_memory_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_weekly_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  report_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_weekly_reports_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_weekly_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.trainer_workout_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['session_started'::text, 'instance_generated'::text, 'action'::text, 'log_set'::text, 'log_interval'::text, 'timer'::text, 'coach_message'::text, 'safety_flag'::text, 'session_completed'::text, 'error'::text])),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  CONSTRAINT trainer_workout_events_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_workout_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_workout_sessions(id)
);
CREATE TABLE public.trainer_workout_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  instance_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_workout_instances_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_workout_instances_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_workout_sessions(id)
);
CREATE TABLE public.trainer_workout_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  log_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trainer_workout_logs_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_workout_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.trainer_workout_sessions(id)
);
CREATE TABLE public.trainer_workout_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'stopped'::text, 'canceled'::text])),
  coach_mode text NOT NULL DEFAULT 'quiet'::text CHECK (coach_mode = ANY (ARRAY['quiet'::text, 'ringer'::text])),
  planned_session_id uuid,
  calendar_event_id uuid,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT trainer_workout_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT trainer_workout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_category_and_weight (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  category text NOT NULL,
  units USER-DEFINED,
  description text NOT NULL,
  enabled boolean NOT NULL,
  weight numeric NOT NULL,
  CONSTRAINT user_category_and_weight_pkey PRIMARY KEY (id),
  CONSTRAINT user_category_and_weights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_locations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  description text,
  geo_data USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  equipment ARRAY,
  user_id uuid NOT NULL,
  current_location boolean DEFAULT false,
  CONSTRAINT user_locations_pkey PRIMARY KEY (id),
  CONSTRAINT user_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_muscle_and_weight (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  muscle text NOT NULL,
  weight numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_muscle_and_weight_pkey PRIMARY KEY (id),
  CONSTRAINT user_muscle_group_and_weight_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  weight_unit character varying NOT NULL DEFAULT 'lbs'::character varying,
  distance_unit character varying NOT NULL DEFAULT 'miles'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.workout_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise_name character varying NOT NULL,
  exercise_type character varying NOT NULL,
  aliases jsonb,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  sets integer,
  reps jsonb,
  load_kg_each jsonb,
  rest_seconds integer,
  distance_km numeric,
  duration_min integer,
  target_pace character varying,
  rounds integer,
  intervals jsonb,
  total_duration_min integer,
  hold_duration_sec jsonb,
  muscles_utilized jsonb NOT NULL,
  goals_addressed jsonb,
  reasoning text,
  equipment jsonb,
  movement_pattern jsonb,
  exercise_description text,
  body_region character varying,
  rpe integer CHECK (rpe >= 1 AND rpe <= 10),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workout_history_pkey PRIMARY KEY (id),
  CONSTRAINT workout_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);