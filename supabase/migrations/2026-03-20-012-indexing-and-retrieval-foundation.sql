CREATE TABLE IF NOT EXISTS public.session_index_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid NOT NULL,
  pending_bytes integer NOT NULL DEFAULT 0,
  pending_messages integer NOT NULL DEFAULT 0,
  last_indexed_seq bigint NOT NULL DEFAULT 0,
  last_index_hash text,
  index_dirty boolean NOT NULL DEFAULT false,
  index_status text NOT NULL DEFAULT 'pending',
  index_dirty_reason text,
  last_indexed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_index_state_pending_bytes_check CHECK (pending_bytes >= 0),
  CONSTRAINT session_index_state_pending_messages_check CHECK (pending_messages >= 0),
  CONSTRAINT session_index_state_last_indexed_seq_check CHECK (last_indexed_seq >= 0),
  CONSTRAINT session_index_state_status_check CHECK (index_status IN ('pending', 'processing', 'indexed', 'failed')),
  CONSTRAINT session_index_state_user_session_unique UNIQUE (user_id, session_key, session_id)
);

ALTER TABLE public.memory_docs
  ADD COLUMN IF NOT EXISTS index_dirty boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS index_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS index_dirty_reason text,
  ADD COLUMN IF NOT EXISTS last_indexed_version integer,
  ADD COLUMN IF NOT EXISTS last_indexed_content_hash text,
  ADD COLUMN IF NOT EXISTS last_indexed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memory_docs_index_status_check'
  ) THEN
    ALTER TABLE public.memory_docs
      ADD CONSTRAINT memory_docs_index_status_check
      CHECK (index_status IN ('pending', 'processing', 'indexed', 'failed'));
  END IF;
END
$$;

ALTER TABLE public.session_index_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

ALTER TABLE public.memory_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_session_index_state_dirty
  ON public.session_index_state(user_id, index_dirty, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_index_state_session_lookup
  ON public.session_index_state(user_id, session_key, session_id);

CREATE INDEX IF NOT EXISTS idx_memory_docs_dirty
  ON public.memory_docs(user_id, index_dirty, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_index_chunks_unique_range
  ON public.session_index_chunks(user_id, session_key, session_id, start_seq_num, end_seq_num);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_chunks_unique_range
  ON public.memory_chunks(user_id, doc_id, doc_version, start_offset, end_offset);

CREATE INDEX IF NOT EXISTS idx_session_index_chunks_search_tsv
  ON public.session_index_chunks
  USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_search_tsv
  ON public.memory_chunks
  USING gin (search_tsv);

ALTER TABLE public.session_index_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_index_state_select_own"
  ON public.session_index_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "session_index_state_service_role_all"
  ON public.session_index_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_session_index_state ON public.session_index_state;
CREATE TRIGGER set_updated_at_session_index_state
BEFORE UPDATE ON public.session_index_state
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.mark_session_index_dirty_from_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_text text;
  v_text_len integer;
  v_message_increment integer;
BEGIN
  v_text := coalesce(NEW.payload ->> 'text', NEW.payload ->> 'message', '');
  v_text_len := char_length(v_text);
  v_message_increment := CASE WHEN v_text_len > 0 THEN 1 ELSE 0 END;

  IF v_text_len = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.session_index_state (
    user_id,
    session_key,
    session_id,
    pending_bytes,
    pending_messages,
    index_dirty,
    index_status,
    index_dirty_reason
  )
  VALUES (
    NEW.user_id,
    NEW.session_key,
    NEW.session_id,
    v_text_len,
    v_message_increment,
    true,
    'pending',
    NEW.event_type
  )
  ON CONFLICT (user_id, session_key, session_id)
  DO UPDATE
  SET pending_bytes = public.session_index_state.pending_bytes + EXCLUDED.pending_bytes,
      pending_messages = public.session_index_state.pending_messages + EXCLUDED.pending_messages,
      index_dirty = true,
      index_status = CASE
        WHEN public.session_index_state.index_status = 'processing' THEN 'processing'
        ELSE 'pending'
      END,
      index_dirty_reason = EXCLUDED.index_dirty_reason,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_session_index_dirty_after_session_event_insert ON public.session_events;
CREATE TRIGGER mark_session_index_dirty_after_session_event_insert
AFTER INSERT ON public.session_events
FOR EACH ROW
EXECUTE FUNCTION public.mark_session_index_dirty_from_event();

INSERT INTO public.session_index_state (
  user_id,
  session_key,
  session_id,
  pending_bytes,
  pending_messages,
  index_dirty,
  index_status,
  index_dirty_reason
)
SELECT
  user_id,
  session_key,
  session_id,
  COALESCE(SUM(char_length(coalesce(payload ->> 'text', payload ->> 'message', ''))), 0) AS pending_bytes,
  COALESCE(COUNT(*) FILTER (
    WHERE char_length(coalesce(payload ->> 'text', payload ->> 'message', '')) > 0
  ), 0) AS pending_messages,
  true AS index_dirty,
  'pending' AS index_status,
  'backfill' AS index_dirty_reason
FROM public.session_events
GROUP BY user_id, session_key, session_id
ON CONFLICT (user_id, session_key, session_id)
DO UPDATE
SET pending_bytes = EXCLUDED.pending_bytes,
    pending_messages = EXCLUDED.pending_messages,
    index_dirty = EXCLUDED.index_dirty,
    index_status = EXCLUDED.index_status,
    index_dirty_reason = EXCLUDED.index_dirty_reason,
    updated_at = now();

UPDATE public.memory_docs
SET index_dirty = true,
    index_status = 'pending',
    index_dirty_reason = COALESCE(index_dirty_reason, 'backfill')
WHERE current_version > 0;

CREATE OR REPLACE FUNCTION public.retrieval_search_postgres_fallback(
  p_user_id uuid,
  p_query_text text,
  p_sources text[] DEFAULT ARRAY['sessions', 'memory', 'program', 'episodic_date'],
  p_max_results integer DEFAULT 8,
  p_candidate_limit integer DEFAULT 32,
  p_min_score numeric DEFAULT 0,
  p_embedding_model text DEFAULT NULL,
  p_embedding_text text DEFAULT NULL
)
RETURNS TABLE (
  source_type text,
  source_id text,
  start_seq_or_offset integer,
  end_seq_or_offset integer,
  chunk_id uuid,
  content text,
  score numeric,
  vector_score numeric,
  fts_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query_text text := btrim(coalesce(p_query_text, ''));
  v_sources text[] := coalesce(p_sources, ARRAY['sessions', 'memory', 'program', 'episodic_date']);
  v_max_results integer := greatest(coalesce(p_max_results, 8), 1);
  v_candidate_limit integer := greatest(coalesce(p_candidate_limit, v_max_results * 4), v_max_results);
  v_min_score numeric := greatest(coalesce(p_min_score, 0), 0);
  v_query tsquery;
  v_embedding vector;
BEGIN
  IF v_query_text = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_query := websearch_to_tsquery('english', v_query_text);
  EXCEPTION WHEN OTHERS THEN
    v_query := plainto_tsquery('english', v_query_text);
  END;

  IF p_embedding_text IS NOT NULL AND btrim(p_embedding_text) <> '' THEN
    BEGIN
      v_embedding := p_embedding_text::vector;
    EXCEPTION WHEN OTHERS THEN
      v_embedding := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH session_fts AS (
    SELECT
      'sessions'::text AS source_type,
      concat(session_key, ':', session_id::text) AS source_id,
      start_seq_num::integer AS start_seq_or_offset,
      end_seq_num::integer AS end_seq_or_offset,
      chunk_id,
      content,
      NULL::numeric AS vector_score,
      ts_rank_cd(search_tsv, v_query)::numeric AS fts_score
    FROM public.session_index_chunks
    WHERE 'sessions' = ANY(v_sources)
      AND user_id = p_user_id
      AND search_tsv @@ v_query
    ORDER BY ts_rank_cd(search_tsv, v_query) DESC, updated_at DESC
    LIMIT v_candidate_limit
  ),
  session_vector AS (
    SELECT
      'sessions'::text AS source_type,
      concat(session_key, ':', session_id::text) AS source_id,
      start_seq_num::integer AS start_seq_or_offset,
      end_seq_num::integer AS end_seq_or_offset,
      chunk_id,
      content,
      greatest(0::numeric, (1 - (embedding <=> v_embedding))::numeric) AS vector_score,
      NULL::numeric AS fts_score
    FROM public.session_index_chunks
    WHERE 'sessions' = ANY(v_sources)
      AND user_id = p_user_id
      AND v_embedding IS NOT NULL
      AND embedding IS NOT NULL
      AND (p_embedding_model IS NULL OR embedding_model = p_embedding_model)
    ORDER BY embedding <=> v_embedding ASC, updated_at DESC
    LIMIT v_candidate_limit
  ),
  memory_fts AS (
    SELECT
      CASE
        WHEN doc_type = 'MEMORY' THEN 'memory'
        WHEN doc_type = 'PROGRAM' THEN 'program'
        WHEN doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
        ELSE lower(doc_type)
      END AS source_type,
      source_key AS source_id,
      start_offset AS start_seq_or_offset,
      end_offset AS end_seq_or_offset,
      chunk_id,
      content,
      NULL::numeric AS vector_score,
      ts_rank_cd(search_tsv, v_query)::numeric AS fts_score
    FROM public.memory_chunks
    WHERE user_id = p_user_id
      AND search_tsv @@ v_query
      AND (
        CASE
          WHEN doc_type = 'MEMORY' THEN 'memory'
          WHEN doc_type = 'PROGRAM' THEN 'program'
          WHEN doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
          ELSE lower(doc_type)
        END
      ) = ANY(v_sources)
    ORDER BY ts_rank_cd(search_tsv, v_query) DESC, updated_at DESC
    LIMIT v_candidate_limit
  ),
  memory_vector AS (
    SELECT
      CASE
        WHEN doc_type = 'MEMORY' THEN 'memory'
        WHEN doc_type = 'PROGRAM' THEN 'program'
        WHEN doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
        ELSE lower(doc_type)
      END AS source_type,
      source_key AS source_id,
      start_offset AS start_seq_or_offset,
      end_offset AS end_seq_or_offset,
      chunk_id,
      content,
      greatest(0::numeric, (1 - (embedding <=> v_embedding))::numeric) AS vector_score,
      NULL::numeric AS fts_score
    FROM public.memory_chunks
    WHERE user_id = p_user_id
      AND v_embedding IS NOT NULL
      AND embedding IS NOT NULL
      AND (p_embedding_model IS NULL OR embedding_model = p_embedding_model)
      AND (
        CASE
          WHEN doc_type = 'MEMORY' THEN 'memory'
          WHEN doc_type = 'PROGRAM' THEN 'program'
          WHEN doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
          ELSE lower(doc_type)
        END
      ) = ANY(v_sources)
    ORDER BY embedding <=> v_embedding ASC, updated_at DESC
    LIMIT v_candidate_limit
  ),
  candidates AS (
    SELECT * FROM session_fts
    UNION ALL
    SELECT * FROM session_vector
    UNION ALL
    SELECT * FROM memory_fts
    UNION ALL
    SELECT * FROM memory_vector
  ),
  merged AS (
    SELECT
      source_type,
      source_id,
      start_seq_or_offset,
      end_seq_or_offset,
      chunk_id,
      content,
      max(coalesce(vector_score, 0)) AS vector_score,
      max(coalesce(fts_score, 0)) AS fts_score
    FROM candidates
    GROUP BY source_type, source_id, start_seq_or_offset, end_seq_or_offset, chunk_id, content
  ),
  scored AS (
    SELECT
      source_type,
      source_id,
      start_seq_or_offset,
      end_seq_or_offset,
      chunk_id,
      content,
      ((0.65 * greatest(0::numeric, least(1::numeric, vector_score))) +
       (0.35 * greatest(0::numeric, least(1::numeric, fts_score / (1 + fts_score)))))::numeric AS score,
      vector_score,
      fts_score
    FROM merged
  )
  SELECT
    source_type,
    source_id,
    start_seq_or_offset,
    end_seq_or_offset,
    chunk_id,
    content,
    score,
    vector_score,
    fts_score
  FROM scored
  WHERE score >= v_min_score
  ORDER BY score DESC, fts_score DESC, start_seq_or_offset ASC
  LIMIT v_max_results;
END;
$$;
