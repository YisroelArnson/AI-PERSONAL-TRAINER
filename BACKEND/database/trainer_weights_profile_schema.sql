-- Weights profile: versioned snapshots of user capability
-- Each entry tracks equipment + movement pattern + load + confidence
-- New versions created after each session completion and during weekly reviews

CREATE TABLE IF NOT EXISTS trainer_weights_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    profile_json JSONB NOT NULL, -- Array of { equipment, movement, load, load_unit, confidence }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    trigger_type TEXT NOT NULL DEFAULT 'session_complete', -- 'initial_inference', 'session_complete', 'weekly_review', 'catch_up'
    trigger_session_id UUID, -- Links to the session that triggered this version
    UNIQUE(user_id, version)
);

ALTER TABLE trainer_weights_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profiles" ON trainer_weights_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage profiles" ON trainer_weights_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_weights_profiles_user_version ON trainer_weights_profiles(user_id, version DESC);
