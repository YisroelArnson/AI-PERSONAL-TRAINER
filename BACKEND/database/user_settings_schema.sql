-- User Settings Table
-- This table stores user preferences like unit settings (weight/distance)
-- Run this SQL in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_unit VARCHAR(10) NOT NULL DEFAULT 'lbs',  -- 'lbs' or 'kg'
  distance_unit VARCHAR(10) NOT NULL DEFAULT 'miles', -- 'miles' or 'km'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient user lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only read their own settings
CREATE POLICY "Users can read own settings" ON user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can only insert their own settings
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own settings
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own settings
CREATE POLICY "Users can delete own settings" ON user_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to auto-update updated_at (reuse existing function if available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $func$ language 'plpgsql';
  END IF;
END
$$;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at 
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON user_settings TO authenticated;
GRANT ALL ON user_settings TO service_role;

