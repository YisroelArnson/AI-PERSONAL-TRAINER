-- Agent Schema for Personal Trainer AI
-- Created: January 15, 2026
-- Purpose: Persistence layer for agent sessions and events

-- Agent Sessions Table
-- Stores conversation sessions for each user
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  context_start_sequence INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Agent Events Table
-- Stores all events in a session (messages, actions, results, knowledge, checkpoints)
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('user_message', 'action', 'result', 'knowledge', 'checkpoint')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, sequence_number)
);

-- Indexes for performance
CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_events_session_sequence ON agent_events(session_id, sequence_number);
CREATE INDEX idx_agent_events_session_type ON agent_events(session_id, event_type);

-- Row Level Security
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

-- Policies for agent_sessions
CREATE POLICY "Users can view own sessions" ON agent_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions" ON agent_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON agent_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Policies for agent_events
CREATE POLICY "Users can view own session events" ON agent_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in own sessions" ON agent_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_sessions 
      WHERE agent_sessions.id = agent_events.session_id 
      AND agent_sessions.user_id = auth.uid()
    )
  );
