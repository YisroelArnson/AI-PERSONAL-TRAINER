-- File overview:
-- Re-applies the guarded assistant transcript append RPC and reloads PostgREST's schema cache.
--
-- Main database routines in this file:
-- - public.append_assistant_event_if_latest_turn: Appends assistant output only when its run is still the latest user turn.

CREATE OR REPLACE FUNCTION public.append_assistant_event_if_latest_turn(
  p_user_id uuid,
  p_session_key text,
  p_session_id uuid,
  p_run_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now(),
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_state public.session_state%ROWTYPE;
  v_trigger_seq_num bigint;
  v_latest_user_seq_num bigint;
  v_event_id uuid;
  v_seq_num bigint;
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

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_RUN_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'MISSING_EVENT_TYPE' USING ERRCODE = 'P0001';
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

  IF v_session_state.current_session_id <> p_session_id THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'session_rotated',
      'sessionKey', v_session_state.session_key,
      'sessionId', v_session_state.current_session_id,
      'sessionVersion', v_session_state.session_version,
      'mode', 'guarded_rpc'
    );
  END IF;

  SELECT seq_num
  INTO v_trigger_seq_num
  FROM public.session_events
  WHERE user_id = p_user_id
    AND session_key = v_session_state.session_key
    AND session_id = p_session_id
    AND run_id = p_run_id
    AND actor = 'user'
  ORDER BY seq_num ASC
  LIMIT 1;

  IF v_trigger_seq_num IS NOT NULL THEN
    SELECT seq_num
    INTO v_latest_user_seq_num
    FROM public.session_events
    WHERE user_id = p_user_id
      AND session_key = v_session_state.session_key
      AND session_id = p_session_id
      AND actor = 'user'
      AND seq_num > v_trigger_seq_num
    ORDER BY seq_num DESC
    LIMIT 1;

    IF v_latest_user_seq_num IS NOT NULL THEN
      RETURN jsonb_build_object(
        'skipped', true,
        'reason', 'stale_user_turn',
        'sessionKey', v_session_state.session_key,
        'sessionId', v_session_state.current_session_id,
        'sessionVersion', v_session_state.session_version,
        'triggerSeqNum', v_trigger_seq_num,
        'latestUserSeqNum', v_latest_user_seq_num,
        'mode', 'guarded_rpc'
      );
    END IF;
  END IF;

  SELECT COALESCE(MAX(seq_num), 0) + 1
  INTO v_seq_num
  FROM public.session_events
  WHERE user_id = p_user_id
    AND session_key = v_session_state.session_key
    AND session_id = p_session_id;

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
    v_session_state.leaf_event_id,
    v_seq_num,
    p_event_type,
    'assistant',
    p_run_id,
    p_idempotency_key,
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_occurred_at, now())
  )
  RETURNING event_id INTO v_event_id;

  UPDATE public.session_state
  SET leaf_event_id = v_event_id,
      session_version = session_version + 1,
      updated_at = now()
  WHERE id = v_session_state.id
  RETURNING *
  INTO v_session_state;

  RETURN jsonb_build_object(
    'skipped', false,
    'eventId', v_event_id,
    'sessionKey', v_session_state.session_key,
    'sessionId', v_session_state.current_session_id,
    'sessionVersion', v_session_state.session_version,
    'seqNum', v_seq_num,
    'mode', 'guarded_rpc'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_assistant_event_if_latest_turn(uuid, text, uuid, uuid, text, jsonb, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_assistant_event_if_latest_turn(uuid, text, uuid, uuid, text, jsonb, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_assistant_event_if_latest_turn(uuid, text, uuid, uuid, text, jsonb, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_assistant_event_if_latest_turn(uuid, text, uuid, uuid, text, jsonb, timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';
