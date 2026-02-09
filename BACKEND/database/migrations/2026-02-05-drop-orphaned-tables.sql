-- Migration: Drop orphaned tables after backend service cleanup
-- Date: 2026-02-05
-- Context: Removing 7 legacy services (recommend, preference, categoryGoals, muscleGoals,
--          interval, exerciseLog, exerciseDistribution) and their associated agent tools.
--          These 6 tables have no remaining code consumers.
--
-- WARNING: This is destructive and irreversible. Back up data first if needed.
-- Run this AFTER backend code cleanup (Phases 1-2) is deployed.

-- 1. exercise_distribution_tracking
--    Was used by: exerciseDistribution.service, dataSources entry, exercises.js agent tool
--    FK: auth.users(id) only, no other tables reference this
DROP TABLE IF EXISTS public.exercise_distribution_tracking;

-- 2. preferences
--    Was used by: preference.service, agent/tools/preferences.js, dataSources entry, fetchUserData
--    FK: auth.users(id) only, no other tables reference this
DROP TABLE IF EXISTS public.preferences;

-- 3. user_category_and_weight
--    Was used by: categoryGoals.service, agent/tools/goals.js, dataSources entry, fetchUserData
--    FK: auth.users(id) only, no other tables reference this
DROP TABLE IF EXISTS public.user_category_and_weight;

-- 4. user_muscle_and_weight
--    Was used by: muscleGoals.service, agent/tools/goals.js, dataSources entry, fetchUserData
--    FK: auth.users(id) only, no other tables reference this
DROP TABLE IF EXISTS public.user_muscle_and_weight;

-- 5. preset_category (static reference data, already had no code consumers)
--    No FK dependencies. Has sequence preset_category_id_seq (dropped automatically).
DROP TABLE IF EXISTS public.preset_category;

-- 6. preset_muscle (static reference data, already had no code consumers)
--    No FK dependencies. Has sequence preset_muscle_id_seq (dropped automatically).
DROP TABLE IF EXISTS public.preset_muscle;
