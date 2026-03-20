ALTER TABLE public.session_state
  ADD COLUMN IF NOT EXISTS current_session_started_at timestamptz;

UPDATE public.session_state
SET current_session_started_at = COALESCE(current_session_started_at, updated_at, created_at, now())
WHERE current_session_started_at IS NULL;

ALTER TABLE public.session_state
  ALTER COLUMN current_session_started_at SET DEFAULT now();

ALTER TABLE public.session_state
  ALTER COLUMN current_session_started_at SET NOT NULL;

DROP FUNCTION IF EXISTS public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.gateway_ingest_message(
  p_user_id uuid,
  p_route text,
  p_idempotency_key text,
  p_request_hash text,
  p_session_key text DEFAULT NULL,
  p_trigger_type text DEFAULT 'user.message',
  p_message text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb,
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
  v_idempotency_row public.idempotency_keys%ROWTYPE;
  v_payload jsonb;
  v_run_id uuid;
  v_event_id uuid;
  v_seq_num bigint;
  v_response jsonb;
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
  v_payload := jsonb_build_object(
    'message', COALESCE(p_message, ''),
    'metadata', COALESCE(p_metadata, '{}'::jsonb)
  );

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
    session_key
  )
  VALUES (
    p_user_id,
    v_session_key
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

  INSERT INTO public.runs (
    user_id,
    session_key,
    session_id,
    trigger_type,
    trigger_payload,
    status
  )
  VALUES (
    p_user_id,
    v_session_state.session_key,
    v_session_state.current_session_id,
    p_trigger_type,
    v_payload || jsonb_build_object('route', p_route),
    'queued'
  )
  RETURNING run_id INTO v_run_id;

  SELECT COALESCE(MAX(seq_num), 0) + 1
  INTO v_seq_num
  FROM public.session_events
  WHERE user_id = p_user_id
    AND session_key = v_session_state.session_key
    AND session_id = v_session_state.current_session_id;

  INSERT INTO public.session_events (
    user_id,
    session_key,
    session_id,
    parent_event_id,
    seq_num,
    event_type,
    actor,
    run_id,
    idempotency_key,
    payload,
    occurred_at
  )
  VALUES (
    p_user_id,
    v_session_state.session_key,
    v_session_state.current_session_id,
    v_session_state.leaf_event_id,
    v_seq_num,
    p_trigger_type,
    'user',
    v_run_id,
    p_idempotency_key,
    v_payload,
    v_now
  )
  RETURNING event_id INTO v_event_id;

  UPDATE public.session_state
  SET leaf_event_id = v_event_id,
      session_version = session_version + 1,
      updated_at = v_now
  WHERE id = v_session_state.id
  RETURNING *
  INTO v_session_state;

  v_response := jsonb_build_object(
    'status', 'accepted',
    'sessionKey', v_session_state.session_key,
    'sessionId', v_session_state.current_session_id,
    'sessionVersion', v_session_state.session_version,
    'eventId', v_event_id,
    'runId', v_run_id,
    'replayed', false,
    'rotated', v_should_rotate,
    'rotationReason', v_rotation_reason,
    'previousSessionId', v_previous_session_id
  );

  UPDATE public.idempotency_keys
  SET response_json = v_response,
      status_code = 202
  WHERE key = p_idempotency_key;

  RETURN v_response;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb, text, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb, text, boolean, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb, text, boolean, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_ingest_message(uuid, text, text, text, text, text, text, jsonb, text, boolean, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.append_session_event(
  p_user_id uuid,
  p_session_key text,
  p_session_id uuid,
  p_event_type text,
  p_actor text,
  p_run_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now(),
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_state public.session_state%ROWTYPE;
  v_event_id uuid;
  v_seq_num bigint;
  v_parent_event_id uuid;
  v_is_current_session boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_USER_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_session_key IS NULL OR btrim(p_session_key) = '' THEN
    RAISE EXCEPTION 'MISSING_SESSION_KEY' USING ERRCODE = 'P0001';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_SESSION_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'MISSING_EVENT_TYPE' USING ERRCODE = 'P0001';
  END IF;

  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'MISSING_ACTOR' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_session_state
  FROM public.session_state
  WHERE user_id = p_user_id
    AND session_key = lower(btrim(p_session_key))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_STATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_is_current_session := v_session_state.current_session_id = p_session_id;

  IF v_is_current_session THEN
    v_parent_event_id := v_session_state.leaf_event_id;

    SELECT COALESCE(MAX(seq_num), 0) + 1
    INTO v_seq_num
    FROM public.session_events
    WHERE user_id = p_user_id
      AND session_key = v_session_state.session_key
      AND session_id = p_session_id;
  ELSE
    SELECT event_id, seq_num + 1
    INTO v_parent_event_id, v_seq_num
    FROM public.session_events
    WHERE user_id = p_user_id
      AND session_key = v_session_state.session_key
      AND session_id = p_session_id
    ORDER BY seq_num DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_ID_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.session_events (
    user_id,
    session_key,
    session_id,
    parent_event_id,
    seq_num,
    event_type,
    actor,
    run_id,
    idempotency_key,
    payload,
    occurred_at
  )
  VALUES (
    p_user_id,
    v_session_state.session_key,
    p_session_id,
    v_parent_event_id,
    v_seq_num,
    p_event_type,
    p_actor,
    p_run_id,
    p_idempotency_key,
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_occurred_at, now())
  )
  RETURNING event_id INTO v_event_id;

  IF v_is_current_session THEN
    UPDATE public.session_state
    SET leaf_event_id = v_event_id,
        session_version = session_version + 1,
        updated_at = now()
    WHERE id = v_session_state.id
    RETURNING *
    INTO v_session_state;

    RETURN jsonb_build_object(
      'eventId', v_event_id,
      'sessionKey', v_session_state.session_key,
      'sessionId', v_session_state.current_session_id,
      'sessionVersion', v_session_state.session_version,
      'seqNum', v_seq_num
    );
  END IF;

  RETURN jsonb_build_object(
    'eventId', v_event_id,
    'sessionKey', v_session_state.session_key,
    'sessionId', p_session_id,
    'sessionVersion', v_session_state.session_version,
    'seqNum', v_seq_num,
    'mode', 'historical_session'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_session_event(uuid, text, uuid, text, text, uuid, jsonb, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_session_event(uuid, text, uuid, text, text, uuid, jsonb, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_session_event(uuid, text, uuid, text, text, uuid, jsonb, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_session_event(uuid, text, uuid, text, text, uuid, jsonb, timestamptz, text) TO service_role;
