-- Exercise Distribution Tracking Table
-- This table stores running totals of category and muscle distribution for each user
-- Enables O(1) incremental updates when exercises are completed
-- Resets when user updates their category/muscle goals
-- Run this SQL in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS exercise_distribution_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tracking period metadata
  tracking_started_at TIMESTAMPTZ NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_exercises_count INT NOT NULL DEFAULT 0,
  
  -- Category totals (JSONB)
  -- Format: {"Strength": 4.5, "Cardio": 2.3, "Flexibility": 1.2}
  -- Each category accumulates share values from goals_addressed
  category_totals JSONB NOT NULL DEFAULT '{}',
  
  -- Muscle totals (JSONB)
  -- Format: {"Chest": 3.2, "Legs": 5.6, "Back": 2.8}
  -- Each muscle accumulates share values from muscles_utilized
  muscle_totals JSONB NOT NULL DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one tracking record per user
  CONSTRAINT unique_user_tracking UNIQUE(user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_distribution_tracking_user_id 
  ON exercise_distribution_tracking(user_id);

CREATE INDEX IF NOT EXISTS idx_distribution_tracking_started_at 
  ON exercise_distribution_tracking(tracking_started_at);

-- Enable Row Level Security
ALTER TABLE exercise_distribution_tracking ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can read their own tracking
CREATE POLICY "Users can read own tracking" ON exercise_distribution_tracking
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own tracking
CREATE POLICY "Users can insert own tracking" ON exercise_distribution_tracking
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own tracking
CREATE POLICY "Users can update own tracking" ON exercise_distribution_tracking
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own tracking
CREATE POLICY "Users can delete own tracking" ON exercise_distribution_tracking
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_distribution_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_distribution_tracking_updated_at_trigger
  BEFORE UPDATE ON exercise_distribution_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_distribution_tracking_updated_at();

