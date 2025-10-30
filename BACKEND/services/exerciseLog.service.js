const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPBASE_SECRET_KEY);

/**
 * Log a completed exercise to the workout_history table
 * @param {string} userId - The user's UUID
 * @param {Object} exerciseData - The exercise data to log
 * @returns {Object} Result with success status and data
 */
async function logCompletedExercise(userId, exerciseData) {
  try {
    // Validate required fields
    if (!userId || !exerciseData) {
      return {
        success: false,
        error: 'Missing required parameters',
        timestamp: new Date().toISOString()
      };
    }

    if (!exerciseData.exercise_name || !exerciseData.exercise_type) {
      return {
        success: false,
        error: 'Exercise name and type are required',
        timestamp: new Date().toISOString()
      };
    }

    // Prepare the data for insertion
    const workoutRecord = {
      user_id: userId,
      exercise_name: exerciseData.exercise_name,
      exercise_type: exerciseData.exercise_type,
      aliases: exerciseData.aliases || null,
      performed_at: exerciseData.performed_at || new Date().toISOString(),
      
      // Exercise-specific fields (nullable)
      sets: exerciseData.sets || null,
      reps: exerciseData.reps || null,
      load_kg_each: exerciseData.load_kg_each || null,
      rest_seconds: exerciseData.rest_seconds || null,
      distance_km: exerciseData.distance_km || null,
      duration_min: exerciseData.duration_min || null,
      target_pace: exerciseData.target_pace || null,
      rounds: exerciseData.rounds || null,
      intervals: exerciseData.intervals || null,
      total_duration_min: exerciseData.total_duration_min || null,
      hold_duration_sec: exerciseData.hold_duration_sec || null,
      
      // Metadata
      muscles_utilized: exerciseData.muscles_utilized || [],
      goals_addressed: exerciseData.goals_addressed || null,
      reasoning: exerciseData.reasoning || null,
      equipment: exerciseData.equipment || null,
      movement_pattern: exerciseData.movement_pattern || null,
      exercise_description: exerciseData.exercise_description || null,
      body_region: exerciseData.body_region || null,
      
      // User feedback
      rpe: exerciseData.rpe || null,
      notes: exerciseData.notes || null
    };

    // Insert into database
    const { data, error } = await supabase
      .from('workout_history')
      .insert([workoutRecord])
      .select()
      .single();

    if (error) {
      console.error('Error inserting workout record:', error);
      return {
        success: false,
        error: 'Failed to log exercise',
        details: error.message,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`Successfully logged exercise: ${exerciseData.exercise_name} for user: ${userId}`);

    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in logCompletedExercise service:', error);
    return {
      success: false,
      error: 'Internal service error',
      details: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get workout history for a user
 * @param {string} userId - The user's UUID
 * @param {Object} options - Query options
 * @param {number} options.limit - Number of records to return
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @returns {Object} Result with success status and data
 */
async function getWorkoutHistory(userId, options = {}) {
  try {
    const { limit = 50, startDate, endDate } = options;

    let query = supabase
      .from('workout_history')
      .select('*')
      .eq('user_id', userId)
      .order('performed_at', { ascending: false });

    if (startDate) {
      query = query.gte('performed_at', startDate);
    }

    if (endDate) {
      query = query.lte('performed_at', endDate);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching workout history:', error);
      return {
        success: false,
        error: 'Failed to fetch workout history',
        details: error.message,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in getWorkoutHistory service:', error);
    return {
      success: false,
      error: 'Internal service error',
      details: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  logCompletedExercise,
  getWorkoutHistory
};

