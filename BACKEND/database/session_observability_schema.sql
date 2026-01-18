-- Session Observability Schema for Personal Trainer AI Agent
-- Created: January 16, 2026
-- Purpose: Unified session and event tracking for context building + observability

-- =============================================================================
-- SESSIONS TABLE
-- One session per user conversation, tracks totals for quick dashboard queries
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Context management
  context_start_sequence INTEGER DEFAULT 0,
  
  -- Aggregated totals (updated on session end or periodically)
  total_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  total_cost_cents NUMERIC(10,4) DEFAULT 0,
  
  -- Session status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- SESSION EVENTS TABLE
-- Unified timeline of all events within a session
-- Used for BOTH context building AND observability
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  
  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'user_message',    -- User input (used for context)
    'llm_request',     -- Full prompt sent to LLM (observability only)
    'llm_response',    -- Full LLM response with tokens/cost (observability only)
    'tool_call',       -- Tool invocation (used for context)
    'tool_result',     -- Tool execution result (used for context)
    'knowledge',       -- Injected knowledge from initializer agent (used for context)
    'error'            -- Any error that occurred
  )),
  
  -- Timing
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  -- Event-specific data (structure depends on event_type)
  -- user_message: { message: string }
  -- llm_request: { model: string, prompt: string, estimated_tokens: number }
  -- llm_response: { content: string, tool_call: { name, arguments } | null, 
  --                 tokens: { prompt, completion, cached, total }, 
  --                 cost_cents: number, finish_reason: string }
  -- tool_call: { tool_name: string, arguments: object, call_id: string }
  -- tool_result: { tool_name: string, result: any, success: boolean, call_id: string }
  -- knowledge: { source: string, data: string }
  -- error: { message: string, stack: string, context: string }
  data JSONB NOT NULL,
  
  -- Ensure unique sequence per session
  UNIQUE(session_id, sequence_number)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated_at ON agent_sessions(updated_at DESC);

-- Events indexes
CREATE INDEX IF NOT EXISTS idx_agent_session_events_session_id ON agent_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_session_events_session_sequence ON agent_session_events(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_agent_session_events_type ON agent_session_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_session_events_timestamp ON agent_session_events(timestamp DESC);

-- Composite index for context building queries (get events from sequence X of type Y)
CREATE INDEX IF NOT EXISTS idx_agent_session_events_context 
  ON agent_session_events(session_id, sequence_number, event_type);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_events ENABLE ROW LEVEL SECURITY;

-- Policies for agent_sessions
CREATE POLICY "Users can view own sessions" ON agent_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions" ON agent_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON agent_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage sessions" ON agent_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Policies for agent_session_events
CREATE POLICY "Users can view own session events" ON agent_session_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_session_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in own sessions" ON agent_session_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_session_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage events" ON agent_session_events
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View for session summaries with event counts
CREATE OR REPLACE VIEW agent_session_summaries AS
SELECT 
  s.id,
  s.user_id,
  s.created_at,
  s.updated_at,
  s.status,
  s.total_tokens,
  s.cached_tokens,
  s.total_cost_cents,
  COUNT(e.id) as event_count,
  COUNT(CASE WHEN e.event_type = 'user_message' THEN 1 END) as message_count,
  COUNT(CASE WHEN e.event_type = 'llm_response' THEN 1 END) as llm_call_count,
  COUNT(CASE WHEN e.event_type = 'tool_call' THEN 1 END) as tool_call_count,
  COUNT(CASE WHEN e.event_type = 'error' THEN 1 END) as error_count,
  MIN(e.timestamp) as first_event_at,
  MAX(e.timestamp) as last_event_at
FROM agent_sessions s
LEFT JOIN agent_session_events e ON e.session_id = s.id
GROUP BY s.id;

-- View for daily metrics (computed from events)
CREATE OR REPLACE VIEW agent_daily_metrics AS
SELECT 
  DATE_TRUNC('day', e.timestamp) as day,
  s.user_id,
  COUNT(DISTINCT s.id) as session_count,
  COUNT(CASE WHEN e.event_type = 'llm_response' THEN 1 END) as llm_call_count,
  COUNT(CASE WHEN e.event_type = 'tool_call' THEN 1 END) as tool_call_count,
  COUNT(CASE WHEN e.event_type = 'error' THEN 1 END) as error_count,
  SUM(CASE WHEN e.event_type = 'llm_response' 
      THEN (e.data->'tokens'->>'total')::INTEGER ELSE 0 END) as total_tokens,
  SUM(CASE WHEN e.event_type = 'llm_response' 
      THEN (e.data->'tokens'->>'cached')::INTEGER ELSE 0 END) as cached_tokens,
  SUM(CASE WHEN e.event_type = 'llm_response' 
      THEN (e.data->>'cost_cents')::NUMERIC ELSE 0 END) as total_cost_cents
FROM agent_session_events e
JOIN agent_sessions s ON s.id = e.session_id
GROUP BY DATE_TRUNC('day', e.timestamp), s.user_id
ORDER BY day DESC;
