-- Observability Schema for Personal Trainer AI Agent
-- Created: January 16, 2026
-- Purpose: Tracing, metrics, and observability data for agent operations

-- =============================================================================
-- TRACES TABLE
-- One trace per agent invocation (chat request or initializer run)
-- =============================================================================
CREATE TABLE agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trace_type TEXT NOT NULL CHECK (trace_type IN ('chat', 'initializer', 'streaming_chat')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  total_duration_ms INTEGER,
  total_tokens INTEGER DEFAULT 0,
  total_cost_cents NUMERIC(10,4) DEFAULT 0,
  iteration_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT
);

-- =============================================================================
-- SPANS TABLE
-- Individual operations within a trace (LLM calls, tool executions, etc.)
-- =============================================================================
CREATE TABLE agent_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
  parent_span_id UUID REFERENCES agent_spans(id) ON DELETE CASCADE,
  span_type TEXT NOT NULL CHECK (span_type IN ('llm_call', 'tool_execution', 'context_init', 'data_fetch')),
  name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  input JSONB,
  output JSONB,
  error TEXT,
  token_usage JSONB, -- {prompt_tokens, completion_tokens, total_tokens}
  cost_cents NUMERIC(10,4),
  model TEXT,
  iteration INTEGER
);

-- =============================================================================
-- HOURLY METRICS TABLE
-- Pre-aggregated metrics for efficient dashboard queries
-- =============================================================================
CREATE TABLE agent_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMPTZ NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('tokens', 'cost', 'latency', 'tool', 'error')),
  metric_name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  sum_value NUMERIC DEFAULT 0,
  avg_value NUMERIC DEFAULT 0,
  min_value NUMERIC,
  max_value NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(hour, user_id, metric_type, metric_name)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Traces indexes
CREATE INDEX idx_agent_traces_session_id ON agent_traces(session_id);
CREATE INDEX idx_agent_traces_user_id ON agent_traces(user_id);
CREATE INDEX idx_agent_traces_started_at ON agent_traces(started_at DESC);
CREATE INDEX idx_agent_traces_status ON agent_traces(status);
CREATE INDEX idx_agent_traces_type ON agent_traces(trace_type);

-- Spans indexes
CREATE INDEX idx_agent_spans_trace_id ON agent_spans(trace_id);
CREATE INDEX idx_agent_spans_parent_span_id ON agent_spans(parent_span_id);
CREATE INDEX idx_agent_spans_type ON agent_spans(span_type);
CREATE INDEX idx_agent_spans_started_at ON agent_spans(started_at DESC);
CREATE INDEX idx_agent_spans_name ON agent_spans(name);

-- Metrics indexes
CREATE INDEX idx_agent_metrics_hourly_hour ON agent_metrics_hourly(hour DESC);
CREATE INDEX idx_agent_metrics_hourly_user_id ON agent_metrics_hourly(user_id);
CREATE INDEX idx_agent_metrics_hourly_type_name ON agent_metrics_hourly(metric_type, metric_name);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics_hourly ENABLE ROW LEVEL SECURITY;

-- Policies for agent_traces
CREATE POLICY "Users can view own traces" ON agent_traces
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage traces" ON agent_traces
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for agent_spans (via trace ownership)
CREATE POLICY "Users can view own spans" ON agent_spans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_traces 
      WHERE agent_traces.id = agent_spans.trace_id 
      AND agent_traces.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage spans" ON agent_spans
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for agent_metrics_hourly
CREATE POLICY "Users can view own metrics" ON agent_metrics_hourly
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role can manage metrics" ON agent_metrics_hourly
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View for trace summaries with span counts
CREATE OR REPLACE VIEW agent_trace_summaries AS
SELECT 
  t.id,
  t.session_id,
  t.user_id,
  t.trace_type,
  t.started_at,
  t.ended_at,
  t.status,
  t.total_duration_ms,
  t.total_tokens,
  t.total_cost_cents,
  t.iteration_count,
  t.error_message,
  COUNT(s.id) as span_count,
  COUNT(CASE WHEN s.span_type = 'llm_call' THEN 1 END) as llm_call_count,
  COUNT(CASE WHEN s.span_type = 'tool_execution' THEN 1 END) as tool_call_count,
  COUNT(CASE WHEN s.status = 'error' THEN 1 END) as error_count
FROM agent_traces t
LEFT JOIN agent_spans s ON s.trace_id = t.id
GROUP BY t.id;

-- View for tool analytics
CREATE OR REPLACE VIEW agent_tool_analytics AS
SELECT 
  name as tool_name,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_calls,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_calls,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
  MIN(duration_ms) as min_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  DATE_TRUNC('day', started_at) as day
FROM agent_spans
WHERE span_type = 'tool_execution'
GROUP BY name, DATE_TRUNC('day', started_at)
ORDER BY day DESC, total_calls DESC;
