-- File overview:
-- Applies the resolve-session-surface-state database changes for the Supabase schema.
--
-- Main database routines in this file:
-- - public.resolve_session_surface_state: Implements the public.resolve_session_surface_state database routine used by this migration.

DROP FUNCTION IF EXISTS public.resolve_session_surface_state(uuid, text, text, boolean, integer);

-- Implements the public.resolve_session_surface_state database routine used by this migration.
CREATE OR REPLACE FUNCTION public.resolve_session_surface_state(
  p_user_id uuid,
  p_session_key text DEFAULT NULL,
  p_user_timezone text DEFAULT 'UTC',
  p_day_boundary_enabled boolean DEFAULT true,
  p_idle_expiry_minutes integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_session_key text;
  v_session_state public.session_state%ROWTYPE;
  v_effective_timezone text := COALESCE(NULLIF(btrim(p_user_timezone), ''), 'UTC');
  v_effective_day_boundary_enabled boolean := COALESCE(p_day_boundary_enabled, true);
  v_effective_idle_expiry_minutes integer := GREATEST(COALESCE(p_idle_expiry_minutes, 180), 0);
  v_should_rotate boolean := false;
  v_rotation_reason text := NULL;
  v_previous_session_id uuid := NULL;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_USER_ID' USING ERRCODE = 'P0001';
  END IF;

  v_session_key := lower(btrim(COALESCE(NULLIF(p_session_key, ''), 'user:' || p_user_id::text || ':main')));

  INSERT INTO public.session_state (
    user_id,
    session_key,
    current_session_started_at
  )
  VALUES (
    p_user_id,
    v_session_key,
    v_now
  )
  ON CONFLICT (user_id, session_key) DO NOTHING;

  SELECT *
  INTO v_session_state
  FROM public.session_state
  WHERE user_id = p_user_id
    AND session_key = v_session_key
  FOR UPDATE;

  IF v_effective_idle_expiry_minutes > 0
     AND v_session_state.updated_at <= v_now - make_interval(mins => v_effective_idle_expiry_minutes) THEN
    v_should_rotate := true;
    v_rotation_reason := 'idle_expiry';
  END IF;

  IF NOT v_should_rotate
     AND v_effective_day_boundary_enabled
     AND (v_session_state.current_session_started_at AT TIME ZONE v_effective_timezone)::date
       < (v_now AT TIME ZONE v_effective_timezone)::date THEN
    v_should_rotate := true;
    v_rotation_reason := 'day_boundary';
  END IF;

  IF v_should_rotate THEN
    v_previous_session_id := v_session_state.current_session_id;

    UPDATE public.session_state
    SET current_session_id = gen_random_uuid(),
        current_session_started_at = v_now,
        leaf_event_id = NULL,
        pinned_feed_item_id = NULL,
        session_version = session_version + 1,
        updated_at = v_now
    WHERE id = v_session_state.id
    RETURNING *
    INTO v_session_state;
  END IF;

  RETURN jsonb_build_object(
    'sessionKey', v_session_state.session_key,
    'sessionId', v_session_state.current_session_id,
    'sessionVersion', v_session_state.session_version,
    'rotated', v_should_rotate,
    'rotationReason', v_rotation_reason,
    'previousSessionId', v_previous_session_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_session_surface_state(uuid, text, text, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_session_surface_state(uuid, text, text, boolean, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_session_surface_state(uuid, text, text, boolean, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_session_surface_state(uuid, text, text, boolean, integer) TO service_role;
