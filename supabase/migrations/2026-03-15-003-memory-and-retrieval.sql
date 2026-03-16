CREATE TABLE IF NOT EXISTS public.memory_docs (
  doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  doc_key text NOT NULL,
  current_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_docs_current_version_check CHECK (current_version >= 0),
  CONSTRAINT memory_docs_user_doc_key_unique UNIQUE (user_id, doc_key)
);

CREATE TABLE IF NOT EXISTS public.memory_doc_versions (
  doc_id uuid NOT NULL REFERENCES public.memory_docs(doc_id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  updated_by_actor text NOT NULL,
  updated_by_run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_doc_versions_primary PRIMARY KEY (doc_id, version),
  CONSTRAINT memory_doc_versions_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS public.session_index_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  session_id uuid NOT NULL,
  start_seq_num bigint NOT NULL,
  end_seq_num bigint NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  embedding_model text,
  embedding vector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_index_chunks_range_check CHECK (start_seq_num > 0 AND end_seq_num >= start_seq_num)
);

CREATE TABLE IF NOT EXISTS public.memory_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_id uuid NOT NULL REFERENCES public.memory_docs(doc_id) ON DELETE CASCADE,
  doc_version integer NOT NULL,
  doc_type text NOT NULL,
  source_key text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  embedding_model text,
  embedding vector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_chunks_offset_range_check CHECK (start_offset >= 0 AND end_offset >= start_offset),
  CONSTRAINT memory_chunks_doc_version_fk
    FOREIGN KEY (doc_id, doc_version)
    REFERENCES public.memory_doc_versions(doc_id, version)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.embedding_cache (
  content_hash text NOT NULL,
  model_key text NOT NULL,
  embedding vector NOT NULL,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embedding_cache_primary PRIMARY KEY (content_hash, model_key),
  CONSTRAINT embedding_cache_token_count_check CHECK (token_count IS NULL OR token_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.retrieval_queries (
  query_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key text,
  run_id uuid REFERENCES public.runs(run_id) ON DELETE SET NULL,
  query_text text NOT NULL,
  policy_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retrieval_results_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.retrieval_queries(query_id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  start_seq_or_offset integer NOT NULL,
  end_seq_or_offset integer NOT NULL,
  chunk_id uuid,
  score numeric NOT NULL,
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retrieval_results_audit_range_check CHECK (end_seq_or_offset >= start_seq_or_offset),
  CONSTRAINT retrieval_results_audit_rank_check CHECK (rank > 0)
);

CREATE INDEX IF NOT EXISTS idx_memory_docs_user_type ON public.memory_docs(user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_memory_doc_versions_doc_created_at ON public.memory_doc_versions(doc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_index_chunks_lookup ON public.session_index_chunks(user_id, session_key, session_id, start_seq_num, end_seq_num);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_lookup ON public.memory_chunks(user_id, doc_id, doc_version, start_offset, end_offset);
CREATE INDEX IF NOT EXISTS idx_retrieval_queries_user_created_at ON public.retrieval_queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_results_audit_query_rank ON public.retrieval_results_audit(query_id, rank);

ALTER TABLE public.memory_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_doc_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_index_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieval_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieval_results_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_docs_select_own"
  ON public.memory_docs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "memory_docs_service_role_all"
  ON public.memory_docs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "memory_doc_versions_select_own"
  ON public.memory_doc_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memory_docs
      WHERE memory_docs.doc_id = memory_doc_versions.doc_id
        AND memory_docs.user_id = auth.uid()
    )
  );

CREATE POLICY "memory_doc_versions_service_role_all"
  ON public.memory_doc_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "session_index_chunks_select_own"
  ON public.session_index_chunks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "session_index_chunks_service_role_all"
  ON public.session_index_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "memory_chunks_select_own"
  ON public.memory_chunks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "memory_chunks_service_role_all"
  ON public.memory_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "embedding_cache_service_role_all"
  ON public.embedding_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "retrieval_queries_select_own"
  ON public.retrieval_queries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "retrieval_queries_service_role_all"
  ON public.retrieval_queries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "retrieval_results_audit_select_own"
  ON public.retrieval_results_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.retrieval_queries
      WHERE retrieval_queries.query_id = retrieval_results_audit.query_id
        AND retrieval_queries.user_id = auth.uid()
    )
  );

CREATE POLICY "retrieval_results_audit_service_role_all"
  ON public.retrieval_results_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_memory_docs ON public.memory_docs;
CREATE TRIGGER set_updated_at_memory_docs
BEFORE UPDATE ON public.memory_docs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_session_index_chunks ON public.session_index_chunks;
CREATE TRIGGER set_updated_at_session_index_chunks
BEFORE UPDATE ON public.session_index_chunks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_memory_chunks ON public.memory_chunks;
CREATE TRIGGER set_updated_at_memory_chunks
BEFORE UPDATE ON public.memory_chunks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
