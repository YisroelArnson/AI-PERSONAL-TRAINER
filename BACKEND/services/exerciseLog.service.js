const { createClient } = require('@supabase/supabase-js');
const { updateTrackingIncrementally, decrementTrackingIncrementally } = require('./exerciseDistribution.service');

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

    // Update distribution tracking incrementally
    try {
      const trackingResult = await updateTrackingIncrementally(userId, exerciseData);
      if (!trackingResult.success) {
        console.warn('Failed to update distribution tracking:', trackingResult.error);
        // Don't fail the exercise log if tracking update fails
      }
    } catch (trackingError) {
      console.warn('Error updating distribution tracking:', trackingError);
      // Don't fail the exercise log if tracking update fails
    }

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

/**
 * Delete a completed exercise from workout_history (undo completion)
 * Also decrements the distribution tracking
 * @param {string} userId - The user's UUID
 * @param {string} exerciseId - The workout_history record UUID
 * @returns {Object} Result with success status
 */
async function deleteCompletedExercise(userId, exerciseId) {
  try {
    // Validate required fields
    if (!userId || !exerciseId) {
      return {
        success: false,
        error: 'Missing required parameters (userId and exerciseId)',
        timestamp: new Date().toISOString()
      };
    }

    // First, fetch the exercise data (needed for decrementing tracking)
    const { data: exerciseData, error: fetchError } = await supabase
      .from('workout_history')
      .select('*')
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching exercise to delete:', fetchError);
      return {
        success: false,
        error: 'Failed to fetch exercise',
        details: fetchError.message,
        timestamp: new Date().toISOString()
      };
    }

    if (!exerciseData) {
      return {
        success: false,
        error: 'Exercise not found or does not belong to user',
        timestamp: new Date().toISOString()
      };
    }

    // Delete the exercise from workout_history
    const { error: deleteError } = await supabase
      .from('workout_history')
      .delete()
      .eq('id', exerciseId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting exercise:', deleteError);
      return {
        success: false,
        error: 'Failed to delete exercise',
        details: deleteError.message,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`Successfully deleted exercise: ${exerciseData.exercise_name} for user: ${userId}`);

    // Decrement distribution tracking
    try {
      const trackingResult = await decrementTrackingIncrementally(userId, exerciseData);
      if (!trackingResult.success) {
        console.warn('Failed to decrement distribution tracking:', trackingResult.error);
        // Don't fail the delete if tracking update fails
      }
    } catch (trackingError) {
      console.warn('Error decrementing distribution tracking:', trackingError);
      // Don't fail the delete if tracking update fails
    }

    return {
      success: true,
      message: `Exercise "${exerciseData.exercise_name}" deleted successfully`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in deleteCompletedExercise service:', error);
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
  getWorkoutHistory,
  deleteCompletedExercise
};

