-- File overview:
-- Applies the memory-doc-write-rpc database changes for the Supabase schema.
--
-- Main database routines in this file:
-- - public.write_memory_doc_version: Implements the public.write_memory_doc_version database routine used by this migration.

DROP FUNCTION IF EXISTS public.write_memory_doc_version(uuid, text, text, text, text, integer, text, uuid);

-- Implements the public.write_memory_doc_version database routine used by this migration.
CREATE OR REPLACE FUNCTION public.write_memory_doc_version(
  p_user_id uuid,
  p_doc_type text,
  p_doc_key text,
  p_content text,
  p_content_hash text,
  p_expected_version integer,
  p_updated_by_actor text,
  p_updated_by_run_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_doc public.memory_docs%ROWTYPE;
  v_current_version public.memory_doc_versions%ROWTYPE;
  v_next_version integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_USER_ID' USING ERRCODE = 'P0001';
  END IF;

  IF p_doc_type IS NULL OR btrim(p_doc_type) = '' THEN
    RAISE EXCEPTION 'MISSING_DOC_TYPE' USING ERRCODE = 'P0001';
  END IF;

  IF p_doc_key IS NULL OR btrim(p_doc_key) = '' THEN
    RAISE EXCEPTION 'MISSING_DOC_KEY' USING ERRCODE = 'P0001';
  END IF;

  IF p_content_hash IS NULL OR btrim(p_content_hash) = '' THEN
    RAISE EXCEPTION 'MISSING_CONTENT_HASH' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'MISSING_EXPECTED_VERSION' USING ERRCODE = 'P0001';
  END IF;

  IF p_updated_by_actor IS NULL OR btrim(p_updated_by_actor) = '' THEN
    RAISE EXCEPTION 'MISSING_UPDATED_BY_ACTOR' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.memory_docs (
    user_id,
    doc_type,
    doc_key
  )
  VALUES (
    p_user_id,
    p_doc_type,
    p_doc_key
  )
  ON CONFLICT (user_id, doc_key) DO NOTHING;

  SELECT *
  INTO v_doc
  FROM public.memory_docs
  WHERE user_id = p_user_id
    AND doc_key = p_doc_key
  FOR UPDATE;

  IF v_doc.doc_type <> p_doc_type THEN
    RAISE EXCEPTION 'DOC_TYPE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_doc.current_version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_doc.current_version > 0 THEN
    SELECT *
    INTO v_current_version
    FROM public.memory_doc_versions
    WHERE doc_id = v_doc.doc_id
      AND version = v_doc.current_version;

    IF v_current_version.content_hash = p_content_hash THEN
      RETURN jsonb_build_object(
        'docId', v_doc.doc_id,
        'docType', v_doc.doc_type,
        'docKey', v_doc.doc_key,
        'currentVersion', v_doc.current_version,
        'createdVersion', NULL,
        'changed', false
      );
    END IF;
  END IF;

  v_next_version := v_doc.current_version + 1;

  INSERT INTO public.memory_doc_versions (
    doc_id,
    version,
    content,
    content_hash,
    updated_by_actor,
    updated_by_run_id,
    created_at
  )
  VALUES (
    v_doc.doc_id,
    v_next_version,
    COALESCE(p_content, ''),
    p_content_hash,
    p_updated_by_actor,
    p_updated_by_run_id,
    v_now
  );

  UPDATE public.memory_docs
  SET current_version = v_next_version,
      updated_at = v_now
  WHERE doc_id = v_doc.doc_id
  RETURNING *
  INTO v_doc;

  RETURN jsonb_build_object(
    'docId', v_doc.doc_id,
    'docType', v_doc.doc_type,
    'docKey', v_doc.doc_key,
    'currentVersion', v_doc.current_version,
    'createdVersion', v_next_version,
    'changed', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_memory_doc_version(uuid, text, text, text, text, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.write_memory_doc_version(uuid, text, text, text, text, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.write_memory_doc_version(uuid, text, text, text, text, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.write_memory_doc_version(uuid, text, text, text, text, integer, text, uuid) TO service_role;
