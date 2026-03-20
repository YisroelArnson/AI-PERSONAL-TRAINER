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
      concat(sic.session_key, ':', sic.session_id::text) AS source_id,
      sic.start_seq_num::integer AS start_seq_or_offset,
      sic.end_seq_num::integer AS end_seq_or_offset,
      sic.chunk_id AS chunk_id,
      sic.content AS content,
      NULL::numeric AS vector_score,
      ts_rank_cd(sic.search_tsv, v_query)::numeric AS fts_score
    FROM public.session_index_chunks sic
    WHERE 'sessions' = ANY(v_sources)
      AND sic.user_id = p_user_id
      AND sic.search_tsv @@ v_query
    ORDER BY ts_rank_cd(sic.search_tsv, v_query) DESC, sic.updated_at DESC
    LIMIT v_candidate_limit
  ),
  session_vector AS (
    SELECT
      'sessions'::text AS source_type,
      concat(sic.session_key, ':', sic.session_id::text) AS source_id,
      sic.start_seq_num::integer AS start_seq_or_offset,
      sic.end_seq_num::integer AS end_seq_or_offset,
      sic.chunk_id AS chunk_id,
      sic.content AS content,
      greatest(0::numeric, (1 - (sic.embedding <=> v_embedding))::numeric) AS vector_score,
      NULL::numeric AS fts_score
    FROM public.session_index_chunks sic
    WHERE 'sessions' = ANY(v_sources)
      AND sic.user_id = p_user_id
      AND v_embedding IS NOT NULL
      AND sic.embedding IS NOT NULL
      AND (p_embedding_model IS NULL OR sic.embedding_model = p_embedding_model)
    ORDER BY sic.embedding <=> v_embedding ASC, sic.updated_at DESC
    LIMIT v_candidate_limit
  ),
  memory_fts AS (
    SELECT
      CASE
        WHEN mc.doc_type = 'MEMORY' THEN 'memory'
        WHEN mc.doc_type = 'PROGRAM' THEN 'program'
        WHEN mc.doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
        ELSE lower(mc.doc_type)
      END AS source_type,
      mc.source_key AS source_id,
      mc.start_offset AS start_seq_or_offset,
      mc.end_offset AS end_seq_or_offset,
      mc.chunk_id AS chunk_id,
      mc.content AS content,
      NULL::numeric AS vector_score,
      ts_rank_cd(mc.search_tsv, v_query)::numeric AS fts_score
    FROM public.memory_chunks mc
    WHERE mc.user_id = p_user_id
      AND mc.search_tsv @@ v_query
      AND (
        CASE
          WHEN mc.doc_type = 'MEMORY' THEN 'memory'
          WHEN mc.doc_type = 'PROGRAM' THEN 'program'
          WHEN mc.doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
          ELSE lower(mc.doc_type)
        END
      ) = ANY(v_sources)
    ORDER BY ts_rank_cd(mc.search_tsv, v_query) DESC, mc.updated_at DESC
    LIMIT v_candidate_limit
  ),
  memory_vector AS (
    SELECT
      CASE
        WHEN mc.doc_type = 'MEMORY' THEN 'memory'
        WHEN mc.doc_type = 'PROGRAM' THEN 'program'
        WHEN mc.doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
        ELSE lower(mc.doc_type)
      END AS source_type,
      mc.source_key AS source_id,
      mc.start_offset AS start_seq_or_offset,
      mc.end_offset AS end_seq_or_offset,
      mc.chunk_id AS chunk_id,
      mc.content AS content,
      greatest(0::numeric, (1 - (mc.embedding <=> v_embedding))::numeric) AS vector_score,
      NULL::numeric AS fts_score
    FROM public.memory_chunks mc
    WHERE mc.user_id = p_user_id
      AND v_embedding IS NOT NULL
      AND mc.embedding IS NOT NULL
      AND (p_embedding_model IS NULL OR mc.embedding_model = p_embedding_model)
      AND (
        CASE
          WHEN mc.doc_type = 'MEMORY' THEN 'memory'
          WHEN mc.doc_type = 'PROGRAM' THEN 'program'
          WHEN mc.doc_type = 'EPISODIC_DATE' THEN 'episodic_date'
          ELSE lower(mc.doc_type)
        END
      ) = ANY(v_sources)
    ORDER BY mc.embedding <=> v_embedding ASC, mc.updated_at DESC
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
      c.source_type AS source_type,
      c.source_id AS source_id,
      c.start_seq_or_offset AS start_seq_or_offset,
      c.end_seq_or_offset AS end_seq_or_offset,
      c.chunk_id AS chunk_id,
      c.content AS content,
      max(coalesce(c.vector_score, 0)) AS vector_score,
      max(coalesce(c.fts_score, 0)) AS fts_score
    FROM candidates c
    GROUP BY
      c.source_type,
      c.source_id,
      c.start_seq_or_offset,
      c.end_seq_or_offset,
      c.chunk_id,
      c.content
  ),
  scored AS (
    SELECT
      m.source_type AS source_type,
      m.source_id AS source_id,
      m.start_seq_or_offset AS start_seq_or_offset,
      m.end_seq_or_offset AS end_seq_or_offset,
      m.chunk_id AS chunk_id,
      m.content AS content,
      ((0.65 * greatest(0::numeric, least(1::numeric, m.vector_score))) +
       (0.35 * greatest(0::numeric, least(1::numeric, m.fts_score / (1 + m.fts_score)))))::numeric AS score,
      m.vector_score AS vector_score,
      m.fts_score AS fts_score
    FROM merged m
  )
  SELECT
    s.source_type,
    s.source_id,
    s.start_seq_or_offset,
    s.end_seq_or_offset,
    s.chunk_id,
    s.content,
    s.score,
    s.vector_score,
    s.fts_score
  FROM scored s
  WHERE s.score >= v_min_score
  ORDER BY s.score DESC, s.fts_score DESC, s.start_seq_or_offset ASC
  LIMIT v_max_results;
END;
$$;
