-- Migration: Structured intake table for screen-by-screen onboarding
-- Replaces the old conversational intake with typed columns

CREATE TABLE IF NOT EXISTS trainer_structured_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- About You
    name TEXT,
    birthday DATE,
    gender TEXT,

    -- Goals
    goals TEXT,
    timeline TEXT,

    -- Training History
    experience_level TEXT,
    frequency TEXT,
    current_routine TEXT,
    past_attempts TEXT,
    hobby_sports TEXT,

    -- Body Metrics
    height_inches INTEGER,
    weight_lbs DECIMAL(5,1),
    body_comp TEXT,

    -- Fitness Baseline
    physical_baseline TEXT,
    mobility TEXT,

    -- Health
    injuries TEXT,
    health_nuances TEXT,
    supplements TEXT,

    -- Lifestyle
    activity_level TEXT,
    sleep TEXT,
    nutrition TEXT,

    -- Equipment
    environment TEXT,

    -- Preferences
    movement_prefs TEXT,
    coaching_style TEXT,
    anything_else TEXT,

    -- Metadata
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'processing', 'processed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE trainer_structured_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own intake"
    ON trainer_structured_intake FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intake"
    ON trainer_structured_intake FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intake"
    ON trainer_structured_intake FOR UPDATE
    USING (auth.uid() = user_id);

-- Add program_markdown column to trainer_programs if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trainer_programs' AND column_name = 'program_markdown'
    ) THEN
        ALTER TABLE trainer_programs ADD COLUMN program_markdown TEXT;
    END IF;
END $$;
