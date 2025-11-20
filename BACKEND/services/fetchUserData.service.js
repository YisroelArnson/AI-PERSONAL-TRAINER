const { createClient } = require('@supabase/supabase-js');
const { getWorkoutHistory } = require('./exerciseLog.service');
const { getDistributionMetrics } = require('./exerciseDistribution.service');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPBASE_SECRET_KEY);

/**
 * Fetches user data from specified tables
 * @param {string} userId - The user's UUID
 * @param {Object} options - Which data to fetch
 * @param {boolean} options.bodyStats - Whether to fetch body stats
 * @param {boolean} options.userCategoryAndWeights - Whether to fetch user category and weights
 * @param {boolean} options.userMuscleAndWeight - Whether to fetch user muscle and weight
 * @param {boolean} options.locations - Whether to fetch user locations
 * @param {boolean} options.preferences - Whether to fetch user preferences
 * @param {boolean} options.workoutHistory - Whether to fetch workout history
 * @param {boolean} options.exerciseDistribution - Whether to fetch exercise distribution tracking
 * @returns {Object} Structured data object with requested user data
 */
async function fetchUserData(userId, options = {}) {
    try {
        // Validate userId
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid userId is required');
        }

        // Default options - fetch all if none specified
        const {
            bodyStats = true,
            userCategoryAndWeights = true,
            userMuscleAndWeight = true,
            locations = true,
            preferences = true,
            workoutHistory = true,
            exerciseDistribution = true
        } = options;

        const result = {
            userId,
            timestamp: new Date().toISOString(),
            data: {}
        };

        // Fetch body stats
        if (bodyStats) {
            try {
                const { data: bodyStatsData, error: bodyStatsError } = await supabase
                    .from('body_stats')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (bodyStatsError && bodyStatsError.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.error('Error fetching body stats:', bodyStatsError);
                    result.data.bodyStats = null;
                    result.errors = result.errors || {};
                    result.errors.bodyStats = bodyStatsError.message;
                } else {
                    // Filter body stats to only include essential fields for AI prompt
                    if (bodyStatsData) {
                        result.data.bodyStats = {
                            sex: bodyStatsData.sex,
                            dob: bodyStatsData.dob,
                            height_cm: bodyStatsData.height_cm,
                            weight_kg: bodyStatsData.weight_kg,
                            body_fat_pct: bodyStatsData.body_fat_pct
                        };
                    } else {
                        result.data.bodyStats = null;
                    }
                }
            } catch (error) {
                console.error('Error in body stats fetch:', error);
                result.data.bodyStats = null;
                result.errors = result.errors || {};
                result.errors.bodyStats = error.message;
            }
        }

        // Fetch user category and weights
        if (userCategoryAndWeights) {
            try {
                const { data: categoryWeightsData, error: categoryWeightsError } = await supabase
                    .from('user_category_and_weight')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: true });

                if (categoryWeightsError) {
                    console.error('Error fetching user category and weights:', categoryWeightsError);
                    result.data.userCategoryAndWeights = [];
                    result.errors = result.errors || {};
                    result.errors.userCategoryAndWeights = categoryWeightsError.message;
                } else {
                    // Filter category and weights to only include essential fields for AI prompt
                    if (categoryWeightsData && categoryWeightsData.length > 0) {
                        result.data.userCategoryAndWeights = categoryWeightsData.map(item => ({
                            category: item.category,
                            description: item.description,
                            units: item.units,
                            weight: item.weight
                        }));
                    } else {
                        result.data.userCategoryAndWeights = [];
                    }
                }
            } catch (error) {
                console.error('Error in user category and weights fetch:', error);
                result.data.userCategoryAndWeights = [];
                result.errors = result.errors || {};
                result.errors.userCategoryAndWeights = error.message;
            }
        }

        // Fetch user muscle and weight
        if (userMuscleAndWeight) {
            try {
                const { data: muscleWeightData, error: muscleWeightError } = await supabase
                    .from('user_muscle_and_weight')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: true });

                if (muscleWeightError) {
                    console.error('Error fetching user muscle and weight:', muscleWeightError);
                    result.data.userMuscleAndWeight = [];
                    result.errors = result.errors || {};
                    result.errors.userMuscleAndWeight = muscleWeightError.message;
                } else {
                    // Filter muscle and weight to only include essential fields for AI prompt
                    if (muscleWeightData && muscleWeightData.length > 0) {
                        result.data.userMuscleAndWeight = muscleWeightData.map(item => ({
                            muscle: item.muscle,
                            weight: item.weight
                        }));
                    } else {
                        result.data.userMuscleAndWeight = [];
                    }
                }
            } catch (error) {
                console.error('Error in user muscle and weight fetch:', error);
                result.data.userMuscleAndWeight = [];
                result.errors = result.errors || {};
                result.errors.userMuscleAndWeight = error.message;
            }
        }

        // Fetch user locations
        if (locations) {
            try {
                const { data: locationsData, error: locationsError } = await supabase
                    .from('user_locations')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: true });

                if (locationsError) {
                    console.error('Error fetching user locations:', locationsError);
                    result.data.locations = null;
                    result.errors = result.errors || {};
                    result.errors.locations = locationsError.message;
                } else {
                    // Filter locations to only include current location with essential fields for AI prompt
                    if (locationsData && locationsData.length > 0) {
                        const currentLocation = locationsData.find(location => location.current_location === true);
                        if (currentLocation) {
                            result.data.locations = {
                                name: currentLocation.name,
                                description: currentLocation.description,
                                equipment: currentLocation.equipment
                            };
                        } else {
                            result.data.locations = null;
                        }
                    } else {
                        result.data.locations = null;
                    }
                }
            } catch (error) {
                console.error('Error in user locations fetch:', error);
                result.data.locations = [];
                result.errors = result.errors || {};
                result.errors.locations = error.message;
            }
        }

        // Fetch user preferences (only active ones)
        if (preferences) {
            try {
                const now = new Date().toISOString();
                const { data: preferencesData, error: preferencesError } = await supabase
                    .from('preferences')
                    .select('*')
                    .eq('user_id', userId)
                    .or(`expire_time.is.null,expire_time.gt.${now}`)
                    .order('created_at', { ascending: false });

                if (preferencesError) {
                    console.error('Error fetching user preferences:', preferencesError);
                    result.data.preferences = [];
                    result.errors = result.errors || {};
                    result.errors.preferences = preferencesError.message;
                } else {
                    // Filter preferences to only include essential fields for AI prompt
                    if (preferencesData && preferencesData.length > 0) {
                        const processedPreferences = preferencesData.map(item => ({
                            description: item.description,
                            user_transcription: item.user_transcription,
                            recommendations_guidance: item.recommendations_guidance,
                            expire_time: item.expire_time,
                            delete_after_call: item.delete_after_call
                        }));
                        
                        // Separate permanent and temporary preferences for better AI context
                        // Temporary: has expire_time OR delete_after_call is true
                        // Permanent: no expire_time AND delete_after_call is false (or null)
                        const temporary = processedPreferences.filter(p => 
                            p.expire_time !== null || p.delete_after_call === true
                        );
                        const permanent = processedPreferences.filter(p => 
                            p.expire_time === null && p.delete_after_call !== true
                        );
                        
                        result.data.preferences = {
                            permanent,
                            temporary,
                            all: processedPreferences
                        };
                    } else {
                        result.data.preferences = {
                            permanent: [],
                            temporary: [],
                            all: []
                        };
                    }
                }
            } catch (error) {
                console.error('Error in user preferences fetch:', error);
                result.data.preferences = {
                    permanent: [],
                    temporary: [],
                    all: []
                };
                result.errors = result.errors || {};
                result.errors.preferences = error.message;
            }
        }

        // Fetch workout history (last 15 exercises for progression logic)
        if (workoutHistory) {
            try {
                const historyResult = await getWorkoutHistory(userId, { limit: 15 });
                
                if (!historyResult.success) {
                    console.error('Error fetching workout history:', historyResult.error);
                    result.data.workoutHistory = [];
                    result.errors = result.errors || {};
                    result.errors.workoutHistory = historyResult.error;
                } else {
                    // Filter workout history to only include essential fields for AI prompt
                    if (historyResult.data && historyResult.data.length > 0) {
                        result.data.workoutHistory = historyResult.data.map(workout => ({
                            exercise_name: workout.exercise_name,
                            exercise_type: workout.exercise_type,
                            performed_at: workout.performed_at,
                            // Include relevant exercise parameters based on type
                            sets: workout.sets,
                            reps: workout.reps,
                            load_kg_each: workout.load_kg_each,
                            distance_km: workout.distance_km,
                            duration_min: workout.duration_min,
                            hold_duration_sec: workout.hold_duration_sec
                        }));
                    } else {
                        result.data.workoutHistory = [];
                    }
                }
            } catch (error) {
                console.error('Error in workout history fetch:', error);
                result.data.workoutHistory = [];
                result.errors = result.errors || {};
                result.errors.workoutHistory = error.message;
            }
        }

        // Fetch exercise distribution tracking
        if (exerciseDistribution) {
            try {
                const distributionMetrics = await getDistributionMetrics(userId);
                result.data.exerciseDistribution = distributionMetrics;
            } catch (error) {
                console.error('Error fetching exercise distribution:', error);
                result.data.exerciseDistribution = null;
                result.errors = result.errors || {};
                result.errors.exerciseDistribution = error.message;
            }
        }

        // Add success status
        result.success = !result.errors || Object.keys(result.errors).length === 0;
        
        return result;

    } catch (error) {
        console.error('Error in fetchUserData:', error);
        return {
            userId,
            timestamp: new Date().toISOString(),
            success: false,
            error: error.message,
            data: {}
        };
    }
}

/**
 * Fetches all user data (convenience function)
 * @param {string} userId - The user's UUID
 * @returns {Object} All user data
 */
async function fetchAllUserData(userId) {
    return fetchUserData(userId, {
        bodyStats: true,
        userCategoryAndWeights: true,
        userMuscleAndWeight: true,
        locations: true,
        preferences: true,
        workoutHistory: true,
        exerciseDistribution: true
    });
}


module.exports = {
    fetchUserData,
    fetchAllUserData
};
