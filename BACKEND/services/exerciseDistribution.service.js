const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPBASE_SECRET_KEY);

/**
 * Reset tracking for a user (called when goals are updated)
 * Deletes existing tracking and creates new record with empty totals
 * @param {string} userId - The user's UUID
 * @returns {Object} Result object with success status
 */
async function resetTracking(userId) {
  try {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    console.log(`Resetting distribution tracking for user: ${userId}`);

    // Delete existing tracking record
    const { error: deleteError } = await supabase
      .from('exercise_distribution_tracking')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting tracking record:', deleteError);
      // Continue anyway to create new record
    }

    // Create new tracking record with empty totals
    const { data, error: insertError } = await supabase
      .from('exercise_distribution_tracking')
      .insert([{
        user_id: userId,
        tracking_started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        total_exercises_count: 0,
        category_totals: {},
        muscle_totals: {}
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating tracking record:', insertError);
      return {
        success: false,
        error: 'Failed to reset tracking',
        details: insertError.message,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`Successfully reset tracking for user: ${userId}`);

    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in resetTracking:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Incrementally update tracking when an exercise is completed
 * Adds exercise's share values to running totals (O(1) operation)
 * @param {string} userId - The user's UUID
 * @param {Object} exerciseData - The exercise data with goals_addressed and muscles_utilized
 * @returns {Object} Result object with success status
 */
async function updateTrackingIncrementally(userId, exerciseData) {
  try {
    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    if (!exerciseData) {
      throw new Error('Exercise data is required');
    }

    console.log(`Updating distribution tracking incrementally for user: ${userId}`);

    // Fetch current tracking record
    let { data: trackingData, error: fetchError } = await supabase
      .from('exercise_distribution_tracking')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching tracking record:', fetchError);
      return {
        success: false,
        error: 'Failed to fetch tracking record',
        details: fetchError.message,
        timestamp: new Date().toISOString()
      };
    }

    // If no tracking record exists, create one
    if (!trackingData) {
      console.log(`No tracking record found for user ${userId}, creating new one`);
      const resetResult = await resetTracking(userId);
      if (!resetResult.success) {
        return resetResult;
      }
      // Fetch the newly created record
      const { data: newTrackingData, error: newFetchError } = await supabase
        .from('exercise_distribution_tracking')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (newFetchError) {
        console.error('Error fetching new tracking record:', newFetchError);
        return {
          success: false,
          error: 'Failed to fetch new tracking record',
          details: newFetchError.message,
          timestamp: new Date().toISOString()
        };
      }

      trackingData = newTrackingData;
    }

    // Get current totals
    const categoryTotals = trackingData.category_totals || {};
    const muscleTotals = trackingData.muscle_totals || {};
    let totalExercises = trackingData.total_exercises_count || 0;

    // Update category totals from goals_addressed
    if (exerciseData.goals_addressed && Array.isArray(exerciseData.goals_addressed)) {
      exerciseData.goals_addressed.forEach(goalItem => {
        // Support both old format (string) and new format (object with goal and share)
        let goal, share;
        
        if (typeof goalItem === 'string') {
          // Old format: treat as 1.0 share
          goal = goalItem;
          share = 1.0;
        } else if (goalItem && typeof goalItem === 'object') {
          // New format: extract goal and share
          goal = goalItem.goal;
          share = goalItem.share || 0;
        }

        if (goal) {
          categoryTotals[goal] = (categoryTotals[goal] || 0) + share;
        }
      });
    }

    // Update muscle totals from muscles_utilized
    if (exerciseData.muscles_utilized && Array.isArray(exerciseData.muscles_utilized)) {
      exerciseData.muscles_utilized.forEach(muscleItem => {
        if (muscleItem && typeof muscleItem === 'object') {
          const muscle = muscleItem.muscle;
          const share = muscleItem.share || 0;
          
          if (muscle) {
            muscleTotals[muscle] = (muscleTotals[muscle] || 0) + share;
          }
        }
      });
    }

    // Increment exercise count
    totalExercises += 1;

    // Update the tracking record
    const { data: updatedData, error: updateError } = await supabase
      .from('exercise_distribution_tracking')
      .update({
        category_totals: categoryTotals,
        muscle_totals: muscleTotals,
        total_exercises_count: totalExercises,
        last_updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating tracking record:', updateError);
      return {
        success: false,
        error: 'Failed to update tracking',
        details: updateError.message,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`Successfully updated tracking for user ${userId}: ${totalExercises} exercises tracked`);

    return {
      success: true,
      data: updatedData,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in updateTrackingIncrementally:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Decrementally update tracking when an exercise completion is undone
 * Subtracts exercise's share values from running totals (O(1) operation)
 * This is the inverse of updateTrackingIncrementally
 * @param {string} userId - The user's UUID
 * @param {Object} exerciseData - The exercise data with goals_addressed and muscles_utilized
 * @returns {Object} Result object with success status
 */
async function decrementTrackingIncrementally(userId, exerciseData) {
  try {
    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    if (!exerciseData) {
      throw new Error('Exercise data is required');
    }

    console.log(`Decrementing distribution tracking for user: ${userId}`);

    // Fetch current tracking record
    let { data: trackingData, error: fetchError } = await supabase
      .from('exercise_distribution_tracking')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching tracking record:', fetchError);
      return {
        success: false,
        error: 'Failed to fetch tracking record',
        details: fetchError.message,
        timestamp: new Date().toISOString()
      };
    }

    // If no tracking record exists, nothing to decrement
    if (!trackingData) {
      console.log(`No tracking record found for user ${userId}, nothing to decrement`);
      return {
        success: true,
        message: 'No tracking record to decrement',
        timestamp: new Date().toISOString()
      };
    }

    // Get current totals
    const categoryTotals = trackingData.category_totals || {};
    const muscleTotals = trackingData.muscle_totals || {};
    let totalExercises = trackingData.total_exercises_count || 0;

    // Subtract category totals from goals_addressed
    if (exerciseData.goals_addressed && Array.isArray(exerciseData.goals_addressed)) {
      exerciseData.goals_addressed.forEach(goalItem => {
        // Support both old format (string) and new format (object with goal and share)
        let goal, share;
        
        if (typeof goalItem === 'string') {
          // Old format: treat as 1.0 share
          goal = goalItem;
          share = 1.0;
        } else if (goalItem && typeof goalItem === 'object') {
          // New format: extract goal and share
          goal = goalItem.goal;
          share = goalItem.share || 0;
        }

        if (goal && categoryTotals[goal] !== undefined) {
          categoryTotals[goal] = Math.max(0, (categoryTotals[goal] || 0) - share);
          // Remove the key if it becomes 0 or negative
          if (categoryTotals[goal] <= 0) {
            delete categoryTotals[goal];
          }
        }
      });
    }

    // Subtract muscle totals from muscles_utilized
    if (exerciseData.muscles_utilized && Array.isArray(exerciseData.muscles_utilized)) {
      exerciseData.muscles_utilized.forEach(muscleItem => {
        if (muscleItem && typeof muscleItem === 'object') {
          const muscle = muscleItem.muscle;
          const share = muscleItem.share || 0;
          
          if (muscle && muscleTotals[muscle] !== undefined) {
            muscleTotals[muscle] = Math.max(0, (muscleTotals[muscle] || 0) - share);
            // Remove the key if it becomes 0 or negative
            if (muscleTotals[muscle] <= 0) {
              delete muscleTotals[muscle];
            }
          }
        }
      });
    }

    // Decrement exercise count (don't go below 0)
    totalExercises = Math.max(0, totalExercises - 1);

    // Update the tracking record
    const { data: updatedData, error: updateError } = await supabase
      .from('exercise_distribution_tracking')
      .update({
        category_totals: categoryTotals,
        muscle_totals: muscleTotals,
        total_exercises_count: totalExercises,
        last_updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating tracking record:', updateError);
      return {
        success: false,
        error: 'Failed to update tracking',
        details: updateError.message,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`Successfully decremented tracking for user ${userId}: ${totalExercises} exercises now tracked`);

    return {
      success: true,
      data: updatedData,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in decrementTrackingIncrementally:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get current distribution metrics with debt calculations
 * @param {string} userId - The user's UUID
 * @returns {Object} Distribution metrics with debt calculations
 */
async function getDistributionMetrics(userId) {
  try {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }

    // Fetch tracking record
    const { data: trackingData, error: trackingError } = await supabase
      .from('exercise_distribution_tracking')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (trackingError) {
      console.error('Error fetching tracking record:', trackingError);
      throw new Error(`Failed to fetch tracking: ${trackingError.message}`);
    }

    // If no tracking record exists, return empty metrics
    if (!trackingData) {
      return {
        trackingSince: null,
        totalExercises: 0,
        categories: {},
        muscles: {},
        hasData: false
      };
    }

    // Fetch user's current category goals
    const { data: categoryGoals, error: categoryError } = await supabase
      .from('user_category_and_weight')
      .select('category, weight')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (categoryError) {
      console.error('Error fetching category goals:', categoryError);
      throw new Error(`Failed to fetch category goals: ${categoryError.message}`);
    }

    // Fetch user's current muscle goals
    const { data: muscleGoals, error: muscleError } = await supabase
      .from('user_muscle_and_weight')
      .select('muscle, weight')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (muscleError) {
      console.error('Error fetching muscle goals:', muscleError);
      throw new Error(`Failed to fetch muscle goals: ${muscleError.message}`);
    }

    // Calculate category distribution and debt
    const categoryTotals = trackingData.category_totals || {};
    const categoryMetrics = {};
    
    // Calculate total category share accumulated
    const totalCategoryShare = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
    
    // Use all goals (no filtering by enabled since column doesn't exist in schema)
    const enabledCategoryGoals = categoryGoals || [];
    
    enabledCategoryGoals.forEach(goal => {
      const categoryName = goal.category;
      const targetWeight = goal.weight;
      const actualTotal = categoryTotals[categoryName] || 0;
      const actualPercentage = totalCategoryShare > 0 ? actualTotal / totalCategoryShare : 0;
      const debt = targetWeight - actualPercentage;

      categoryMetrics[categoryName] = {
        target: targetWeight,
        actual: actualPercentage,
        debt: debt,
        totalShare: actualTotal
      };
    });

    // Calculate muscle distribution and debt
    const muscleTotals = trackingData.muscle_totals || {};
    const muscleMetrics = {};
    
    // Calculate total muscle share accumulated
    const totalMuscleShare = Object.values(muscleTotals).reduce((sum, val) => sum + val, 0);
    
    // Use all goals (no filtering by enabled since column doesn't exist in schema)
    const enabledMuscleGoals = muscleGoals || [];
    
    enabledMuscleGoals.forEach(goal => {
      const muscleName = goal.muscle;
      const targetWeight = goal.weight;
      const actualTotal = muscleTotals[muscleName] || 0;
      const actualPercentage = totalMuscleShare > 0 ? actualTotal / totalMuscleShare : 0;
      const debt = targetWeight - actualPercentage;

      muscleMetrics[muscleName] = {
        target: targetWeight,
        actual: actualPercentage,
        debt: debt,
        totalShare: actualTotal
      };
    });

    return {
      trackingSince: trackingData.tracking_started_at,
      totalExercises: trackingData.total_exercises_count,
      categories: categoryMetrics,
      muscles: muscleMetrics,
      hasData: true
    };

  } catch (error) {
    console.error('Error in getDistributionMetrics:', error);
    throw error;
  }
}

/**
 * Format distribution data for AI prompt
 * @param {Object} distributionMetrics - The distribution metrics from getDistributionMetrics
 * @returns {string} Formatted string for AI prompt
 */
function formatDistributionForPrompt(distributionMetrics) {
  if (!distributionMetrics || !distributionMetrics.hasData) {
    return '';
  }

  const output = [];
  
  // Format tracking since date
  const trackingDate = distributionMetrics.trackingSince 
    ? new Date(distributionMetrics.trackingSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'unknown';

  output.push(`\nGOAL DISTRIBUTION STATUS (tracking since ${trackingDate}):`);
  output.push(`  Total exercises tracked: ${distributionMetrics.totalExercises}`);

  // Format category distribution
  const categories = Object.entries(distributionMetrics.categories);
  if (categories.length > 0) {
    output.push(`\n  CATEGORY DISTRIBUTION:`);
    
    // Show categories with positive debt (under-represented) first
    const underRepresented = categories.filter(([, data]) => data.debt > 0.05);
    const overRepresented = categories.filter(([, data]) => data.debt < -0.05);
    const onTarget = categories.filter(([, data]) => Math.abs(data.debt) <= 0.05);

    if (underRepresented.length > 0) {
      output.push(`    UNDER-REPRESENTED (need more):`);
      underRepresented
        .sort((a, b) => b[1].debt - a[1].debt) // Sort by debt descending
        .forEach(([name, data]) => {
          const targetPct = (data.target * 100).toFixed(0);
          const actualPct = (data.actual * 100).toFixed(0);
          const debtPct = (data.debt * 100).toFixed(0);
          output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% → NEEDS +${debtPct}%`);
        });
    }

    if (overRepresented.length > 0) {
      output.push(`    OVER-REPRESENTED (reduce):`);
      overRepresented
        .sort((a, b) => a[1].debt - b[1].debt) // Sort by debt ascending (most negative first)
        .forEach(([name, data]) => {
          const targetPct = (data.target * 100).toFixed(0);
          const actualPct = (data.actual * 100).toFixed(0);
          const excessPct = (Math.abs(data.debt) * 100).toFixed(0);
          output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% → OVER by ${excessPct}%`);
        });
    }

    if (onTarget.length > 0) {
      output.push(`    ON TARGET:`);
      onTarget.forEach(([name, data]) => {
        const targetPct = (data.target * 100).toFixed(0);
        const actualPct = (data.actual * 100).toFixed(0);
        output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% ✓`);
      });
    }
  }

  // Format muscle distribution
  const muscles = Object.entries(distributionMetrics.muscles);
  if (muscles.length > 0) {
    output.push(`\n  MUSCLE DISTRIBUTION:`);
    
    // Show muscles with positive debt (under-represented) first
    const underRepresented = muscles.filter(([, data]) => data.debt > 0.05);
    const overRepresented = muscles.filter(([, data]) => data.debt < -0.05);
    const onTarget = muscles.filter(([, data]) => Math.abs(data.debt) <= 0.05);

    if (underRepresented.length > 0) {
      output.push(`    UNDER-REPRESENTED (need more):`);
      underRepresented
        .sort((a, b) => b[1].debt - a[1].debt) // Sort by debt descending
        .forEach(([name, data]) => {
          const targetPct = (data.target * 100).toFixed(0);
          const actualPct = (data.actual * 100).toFixed(0);
          const debtPct = (data.debt * 100).toFixed(0);
          output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% → NEEDS +${debtPct}%`);
        });
    }

    if (overRepresented.length > 0) {
      output.push(`    OVER-REPRESENTED (reduce):`);
      overRepresented
        .sort((a, b) => a[1].debt - b[1].debt) // Sort by debt ascending (most negative first)
        .forEach(([name, data]) => {
          const targetPct = (data.target * 100).toFixed(0);
          const actualPct = (data.actual * 100).toFixed(0);
          const excessPct = (Math.abs(data.debt) * 100).toFixed(0);
          output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% → OVER by ${excessPct}%`);
        });
    }

    if (onTarget.length > 0) {
      output.push(`    ON TARGET:`);
      onTarget.forEach(([name, data]) => {
        const targetPct = (data.target * 100).toFixed(0);
        const actualPct = (data.actual * 100).toFixed(0);
        output.push(`      - ${name}: TARGET ${targetPct}%, ACTUAL ${actualPct}% ✓`);
      });
    }
  }

  return output.join('\n');
}

module.exports = {
  resetTracking,
  updateTrackingIncrementally,
  decrementTrackingIncrementally,
  getDistributionMetrics,
  formatDistributionForPrompt
};

