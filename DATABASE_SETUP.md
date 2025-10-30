# Database Setup Guide

## Quick Start: Create workout_history Table

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New query"

### Step 2: Run the Schema SQL

Copy and paste the entire contents of `BACKEND/database/workout_history_schema.sql` into the SQL editor and click "Run".

Alternatively, you can run this complete script:

```sql
-- Workout History Table
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
  load_kg_each JSONB,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workout_history_user_id ON workout_history(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_history_performed_at ON workout_history(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_history_exercise_name ON workout_history(exercise_name);
CREATE INDEX IF NOT EXISTS idx_workout_history_exercise_type ON workout_history(exercise_type);
CREATE INDEX IF NOT EXISTS idx_workout_history_created_at ON workout_history(created_at DESC);

-- Enable Row Level Security
ALTER TABLE workout_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own workout history" ON workout_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout history" ON workout_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout history" ON workout_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout history" ON workout_history
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_workout_history_updated_at 
  BEFORE UPDATE ON workout_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON workout_history TO authenticated;
GRANT ALL ON workout_history TO service_role;
```

### Step 3: Verify Table Creation

Run this query to verify the table was created successfully:

```sql
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM 
  information_schema.columns 
WHERE 
  table_name = 'workout_history'
ORDER BY 
  ordinal_position;
```

You should see all the columns listed.

### Step 4: Test Insert (Optional)

Test inserting a sample record:

```sql
INSERT INTO workout_history (
  user_id,
  exercise_name,
  exercise_type,
  muscles_utilized,
  sets,
  reps,
  load_kg_each
) VALUES (
  auth.uid(),  -- Your user ID
  'Barbell Bench Press',
  'strength',
  '[{"muscle": "chest", "share": 0.5}, {"muscle": "triceps", "share": 0.3}, {"muscle": "shoulders", "share": 0.2}]'::jsonb,
  4,
  '[8, 8, 6, 6]'::jsonb,
  '[80, 80, 85, 85]'::jsonb
);
```

### Step 5: Verify RLS Policies

Check that Row Level Security is working:

```sql
SELECT * FROM workout_history;
```

You should only see your own workout records.

## Table Structure Overview

### Required Fields
- `user_id` - References auth.users
- `exercise_name` - Name of the exercise
- `exercise_type` - Type (strength, cardio_distance, hiit, etc.)
- `muscles_utilized` - JSONB array of muscle utilization
- `performed_at` - When the exercise was completed

### Optional Fields (Type-Specific)

#### Strength
- `sets`, `reps`, `load_kg_each`, `rest_seconds`

#### Cardio Distance
- `distance_km`, `duration_min`, `target_pace`

#### Cardio Time
- `duration_min`

#### HIIT
- `rounds`, `intervals`, `total_duration_min`

#### Isometric
- `sets`, `hold_duration_sec`, `rest_seconds`

#### Bodyweight
- `sets`, `reps`, `rest_seconds`

### Metadata Fields
- `goals_addressed` - JSONB array
- `reasoning` - TEXT
- `equipment` - JSONB array
- `movement_pattern` - JSONB array
- `exercise_description` - TEXT
- `body_region` - VARCHAR

### User Feedback
- `rpe` - Rate of Perceived Exertion (1-10)
- `notes` - TEXT for user comments

## Troubleshooting

### Error: "relation auth.users does not exist"
Make sure you're running this in your Supabase project, not a local PostgreSQL instance.

### Error: "permission denied"
Ensure you're running the script as a superuser or have the necessary permissions.

### RLS Policies Not Working
1. Verify RLS is enabled: `SELECT * FROM pg_tables WHERE tablename = 'workout_history';`
2. Check policies: `SELECT * FROM pg_policies WHERE tablename = 'workout_history';`
3. Make sure you're authenticated when querying

### Can't Insert Data
1. Check that `auth.uid()` returns a valid user ID
2. Verify the required fields are present
3. Ensure JSONB fields are properly formatted

## Querying Examples

### Get all workouts for current user
```sql
SELECT * FROM workout_history 
WHERE user_id = auth.uid()
ORDER BY performed_at DESC;
```

### Get workouts by exercise type
```sql
SELECT * FROM workout_history 
WHERE user_id = auth.uid() 
  AND exercise_type = 'strength'
ORDER BY performed_at DESC;
```

### Get workouts from last 7 days
```sql
SELECT * FROM workout_history 
WHERE user_id = auth.uid() 
  AND performed_at >= NOW() - INTERVAL '7 days'
ORDER BY performed_at DESC;
```

### Count workouts by type
```sql
SELECT 
  exercise_type, 
  COUNT(*) as count
FROM workout_history 
WHERE user_id = auth.uid()
GROUP BY exercise_type;
```

### Get most performed exercises
```sql
SELECT 
  exercise_name, 
  COUNT(*) as times_performed
FROM workout_history 
WHERE user_id = auth.uid()
GROUP BY exercise_name
ORDER BY times_performed DESC
LIMIT 10;
```

## Next Steps

After setting up the database:

1. ✅ Table created
2. ✅ RLS policies enabled
3. ✅ Indexes created
4. ⬜ Start backend server (`cd BACKEND && node index.js`)
5. ⬜ Test API endpoints with Postman or curl
6. ⬜ Run iOS app and test exercise completion

---

**Need Help?** Check `IMPLEMENTATION_SUMMARY.md` for full implementation details.

