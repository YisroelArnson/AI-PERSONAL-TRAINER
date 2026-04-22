-- File overview:
-- Applies the queue-delivery-recovery-cutover database changes for the Supabase schema.
--
-- This file is primarily composed of schema changes, data movement, or raw SQL statements rather than database routines.

CREATE TABLE IF NOT EXISTS public.queue_dead_letters (
  dead_letter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  job_name text NOT NULL,
  bullmq_job_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  session_key text,
  session_id uuid,
  doc_id uuid REFERENCES public.memory_docs(doc_id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.delivery_outbox(delivery_id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_class text NOT NULL,
  error_code text,
  error_message text,
  error_stack text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  replayable boolean NOT NULL DEFAULT true,
  replay_count integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  last_replayed_at timestamptz,
  last_replayed_job_id text,
  resolution_status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_dead_letters_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT queue_dead_letters_max_attempts_check CHECK (max_attempts >= 1),
  CONSTRAINT queue_dead_letters_replay_count_check CHECK (replay_count >= 0),
  CONSTRAINT queue_dead_letters_resolution_status_check CHECK (resolution_status IN ('open', 'replayed', 'resolved', 'canceled')),
  CONSTRAINT queue_dead_letters_unique_job UNIQUE (queue_name, bullmq_job_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_open
  ON public.queue_dead_letters(resolution_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_job_name
  ON public.queue_dead_letters(job_name, resolution_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_run_id
  ON public.queue_dead_letters(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_run_channel
  ON public.delivery_outbox(run_id, channel, created_at DESC);

ALTER TABLE public.queue_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_dead_letters_service_role_all" ON public.queue_dead_letters;
CREATE POLICY "queue_dead_letters_service_role_all"
  ON public.queue_dead_letters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_queue_dead_letters ON public.queue_dead_letters;
CREATE TRIGGER set_updated_at_queue_dead_letters
BEFORE UPDATE ON public.queue_dead_letters
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
