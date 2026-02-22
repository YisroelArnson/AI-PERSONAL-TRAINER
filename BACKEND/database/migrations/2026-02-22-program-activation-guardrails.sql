-- Program activation guardrails
-- Enforces a single active program per user and reconciles legacy rows.

-- 1) Make the pointer table canonical: if trainer_active_program points to a non-active row,
-- promote that row back to active.
UPDATE public.trainer_programs p
SET
  status = 'active',
  active_from = COALESCE(p.active_from, NOW()),
  updated_at = NOW()
FROM public.trainer_active_program ap
WHERE p.id = ap.program_id
  AND p.user_id = ap.user_id
  AND p.status <> 'active';

-- 2) For users with active rows but no pointer row, choose the newest active row as canonical.
WITH ranked_active_without_pointer AS (
  SELECT
    p.user_id,
    p.id AS program_id,
    p.version AS program_version,
    ROW_NUMBER() OVER (
      PARTITION BY p.user_id
      ORDER BY COALESCE(p.active_from, p.updated_at, p.created_at) DESC, p.id DESC
    ) AS rn
  FROM public.trainer_programs p
  LEFT JOIN public.trainer_active_program ap ON ap.user_id = p.user_id
  WHERE p.status = 'active'
    AND ap.user_id IS NULL
)
INSERT INTO public.trainer_active_program (user_id, program_id, program_version, updated_at)
SELECT user_id, program_id, program_version, NOW()
FROM ranked_active_without_pointer
WHERE rn = 1
ON CONFLICT (user_id)
DO UPDATE SET
  program_id = EXCLUDED.program_id,
  program_version = EXCLUDED.program_version,
  updated_at = EXCLUDED.updated_at;

-- 3) Archive all non-canonical active rows.
UPDATE public.trainer_programs p
SET
  status = 'archived',
  updated_at = NOW()
FROM public.trainer_active_program ap
WHERE p.user_id = ap.user_id
  AND p.status = 'active'
  AND p.id <> ap.program_id;

-- 4) Hard DB guardrail: at most one active program per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_programs_one_active_per_user
ON public.trainer_programs(user_id)
WHERE status = 'active';
