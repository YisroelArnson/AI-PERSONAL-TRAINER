CREATE INDEX IF NOT EXISTS idx_runs_active_user_session
  ON public.runs(user_id, session_key, session_id, created_at DESC)
  WHERE status IN ('queued', 'running');

DROP FUNCTION IF EXISTS public.manual_reset_session(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.manual_reset_session(
  p_user_id uuid,
  p_route text,
  p_idempotency_key text,
  p_request_hash text,
  p_session_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_session_key text;
  v_session_state public.session_state%ROWTYPE;
  v_idempotency_row public.idempotency_keys%ROWTYPE;
  v_response jsonb;
  v_previous_session_id uuid := NULL;
  v_rotated boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_USER_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_route IS NULL OR btrim(p_route) = '' THEN
    RAISE EXCEPTION 'MISSING_ROUTE' USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'MISSING_IDEMPOTENCY_KEY' USING ERRCODE = 'P0001';
  END IF;

  IF p_request_hash IS NULL OR btrim(p_request_hash) = '' THEN
    RAISE EXCEPTION 'MISSING_REQUEST_HASH' USING ERRCODE = 'P0001';
  END IF;

  v_session_key := lower(btrim(COALESCE(NULLIF(p_session_key, ''), 'user:' || p_user_id::text || ':main')));

  INSERT INTO public.idempotency_keys (
    key,
    user_id,
    route,
    request_hash,
    expires_at
  )
  VALUES (
    p_idempotency_key,
    p_user_id,
    p_route,
    p_request_hash,
    v_now + interval '24 hours'
  )
  ON CONFLICT (key) DO NOTHING;

  SELECT *
  INTO v_idempotency_row
  FROM public.idempotency_keys
  WHERE key = p_idempotency_key
  FOR UPDATE;

  IF v_idempotency_row.user_id <> p_user_id OR v_idempotency_row.route <> p_route THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_SCOPE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_idempotency_row.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF v_idempotency_row.response_json IS NOT NULL THEN
    RETURN v_idempotency_row.response_json || jsonb_build_object('replayed', true);
  END IF;

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
  ON CONFLICT (user_id, session_key) DO NOTHING
  RETURNING *
  INTO v_session_state;

  IF NOT FOUND THEN
    SELECT *
    INTO v_session_state
    FROM public.session_state
    WHERE user_id = p_user_id
      AND session_key = v_session_key
    FOR UPDATE;

    v_previous_session_id := v_session_state.current_session_id;
    v_rotated := true;

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

  v_response := jsonb_build_object(
    'status', 'reset',
    'sessionKey', v_session_state.session_key,
    'sessionId', v_session_state.current_session_id,
    'sessionVersion', v_session_state.session_version,
    'replayed', false,
    'rotated', v_rotated,
    'rotationReason', CASE WHEN v_rotated THEN 'manual_reset' ELSE NULL END,
    'previousSessionId', v_previous_session_id
  );

  UPDATE public.idempotency_keys
  SET response_json = v_response,
      status_code = 200
  WHERE key = p_idempotency_key;

  RETURN v_response;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manual_reset_session(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_reset_session(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_reset_session(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manual_reset_session(uuid, text, text, text, text) TO service_role;
