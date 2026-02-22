-- Program schedule extraction fields
-- Stores deterministic schedule JSON extracted from markdown plus freshness metadata.

ALTER TABLE public.trainer_programs
  ADD COLUMN IF NOT EXISTS schedule_json JSONB;

ALTER TABLE public.trainer_programs
  ADD COLUMN IF NOT EXISTS schedule_extracted_at TIMESTAMPTZ;

ALTER TABLE public.trainer_programs
  ADD COLUMN IF NOT EXISTS schedule_extractor_model TEXT;

ALTER TABLE public.trainer_programs
  ADD COLUMN IF NOT EXISTS schedule_source_markdown_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_trainer_programs_schedule_hash
  ON public.trainer_programs(schedule_source_markdown_hash);
