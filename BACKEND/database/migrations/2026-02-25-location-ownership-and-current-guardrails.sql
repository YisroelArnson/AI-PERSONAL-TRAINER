-- Location ownership + single-current guardrails
-- 2026-02-25

ALTER TABLE public.user_locations
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_user_locations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_user_locations_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_locations_set_updated_at
    BEFORE UPDATE ON public.user_locations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_user_locations_updated_at();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_locations_one_current_per_user_idx
ON public.user_locations (user_id)
WHERE current_location = true;
