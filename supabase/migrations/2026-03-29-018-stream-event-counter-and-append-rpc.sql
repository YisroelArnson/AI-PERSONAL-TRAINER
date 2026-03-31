CREATE TABLE IF NOT EXISTS public.stream_event_counters (
  run_id uuid PRIMARY KEY REFERENCES public.runs(run_id) ON DELETE CASCADE,
  last_seq_num integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stream_event_counters_last_seq_num_check CHECK (last_seq_num >= 0)
);

ALTER TABLE public.stream_event_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stream_event_counters_service_role_all" ON public.stream_event_counters;
CREATE POLICY "stream_event_counters_service_role_all"
  ON public.stream_event_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP FUNCTION IF EXISTS public.append_stream_event(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.append_stream_event(
  p_run_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq_num integer;
  v_row public.stream_events%ROWTYPE;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_RUN_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'MISSING_EVENT_TYPE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.stream_event_counters (
    run_id,
    last_seq_num,
    updated_at
  )
  VALUES (
    p_run_id,
    1,
    now()
  )
  ON CONFLICT (run_id) DO UPDATE
    SET last_seq_num = public.stream_event_counters.last_seq_num + 1,
        updated_at = now()
  RETURNING last_seq_num
  INTO v_seq_num;

  INSERT INTO public.stream_events (
    run_id,
    seq_num,
    event_type,
    payload
  )
  VALUES (
    p_run_id,
    v_seq_num,
    p_event_type,
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING *
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'run_id', v_row.run_id,
    'seq_num', v_row.seq_num,
    'event_type', v_row.event_type,
    'payload', v_row.payload,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_stream_event(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_stream_event(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_stream_event(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_stream_event(uuid, text, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.append_stream_events_bulk(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.append_stream_events_bulk(
  p_run_id uuid,
  p_events jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted_count integer := 0;
  v_last_seq_num integer := 0;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_RUN_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_events IS NULL THEN
    p_events := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_EVENTS_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX((event_item->>'seq_num')::integer), 0)
  INTO v_last_seq_num
  FROM jsonb_array_elements(p_events) AS event_item;

  INSERT INTO public.stream_events (
    run_id,
    seq_num,
    event_type,
    payload,
    created_at
  )
  SELECT
    p_run_id,
    event_row.seq_num,
    event_row.event_type,
    COALESCE(event_row.payload, '{}'::jsonb),
    COALESCE(event_row.created_at, now())
  FROM jsonb_to_recordset(p_events) AS event_row(
    seq_num integer,
    event_type text,
    payload jsonb,
    created_at timestamptz
  )
  WHERE event_row.seq_num IS NOT NULL
    AND event_row.seq_num > 0
    AND event_row.event_type IS NOT NULL
    AND btrim(event_row.event_type) <> ''
  ORDER BY event_row.seq_num
  ON CONFLICT (run_id, seq_num) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  INSERT INTO public.stream_event_counters (
    run_id,
    last_seq_num,
    updated_at
  )
  VALUES (
    p_run_id,
    v_last_seq_num,
    now()
  )
  ON CONFLICT (run_id) DO UPDATE
    SET last_seq_num = GREATEST(public.stream_event_counters.last_seq_num, EXCLUDED.last_seq_num),
        updated_at = now();

  RETURN jsonb_build_object(
    'insertedCount', v_inserted_count,
    'lastSeqNum', NULLIF(v_last_seq_num, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_stream_events_bulk(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_stream_events_bulk(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_stream_events_bulk(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_stream_events_bulk(uuid, jsonb) TO service_role;
