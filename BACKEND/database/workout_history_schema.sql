-- Workout History Table
-- This table stores all completed exercises with their full data
-- Run this SQL in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS workout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name VARCHAR(255) NOT NULL,
  exercise_type VARCHAR(50) NOT NULL,
  aliases JSONB,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Exercise-specific fields (nullable based on type)
  sets INT,
  reps JSONB,
  load_each JSONB,
  load_unit VARCHAR(10),
  rest_seconds INT,
  distance_km DECIMAL(6,2),
  duration_min INT,
  target_pace VARCHAR(50),
  rounds INT,
  intervals JSONB,
  total_duration_min INT,
  hold_duration_sec JSONB,
  
  -- Metadata
  muscles_utilized JSONB NOT NULL,
  goals_addressed JSONB,
  reasoning TEXT,
  equipment JSONB,
  movement_pattern JSONB,
  exercise_description TEXT,
  body_region VARCHAR(50),
  
  -- User feedback
  rpe INT CHECK (rpe >= 1 AND rpe <= 10),
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workout_history_user_id ON workout_history(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_history_performed_at ON workout_history(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_history_exercise_name ON workout_history(exercise_name);
CREATE INDEX IF NOT EXISTS idx_workout_history_exercise_type ON workout_history(exercise_type);
CREATE INDEX IF NOT EXISTS idx_workout_history_created_at ON workout_history(created_at DESC);

-- Enable Row Level Security
ALTER TABLE workout_history ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only read their own workout history
CREATE POLICY "Users can read own workout history" ON workout_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can only insert their own workout history
CREATE POLICY "Users can insert own workout history" ON workout_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own workout history
CREATE POLICY "Users can update own workout history" ON workout_history
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own workout history
CREATE POLICY "Users can delete own workout history" ON workout_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_workout_history_updated_at 
  BEFORE UPDATE ON workout_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
GRANT ALL ON workout_history TO authenticated;
GRANT ALL ON workout_history TO service_role;

