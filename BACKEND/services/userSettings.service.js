const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPBASE_SECRET_KEY);

// Default settings for new users
const DEFAULT_SETTINGS = {
    weight_unit: 'lbs',
    distance_unit: 'miles'
};

/**
 * Get user settings (returns defaults if none exist)
 * @param {string} userId - The user's UUID
 * @returns {Object} User settings with weight_unit and distance_unit
 */
async function getUserSettings(userId) {
    try {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid userId is required');
        }

        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user settings:', error);
            throw error;
        }

        // Return existing settings or defaults
        if (data) {
            return {
                success: true,
                data: {
                    weight_unit: data.weight_unit,
                    distance_unit: data.distance_unit
                }
            };
        }

        // Return defaults if no settings exist
        return {
            success: true,
            data: DEFAULT_SETTINGS
        };

    } catch (error) {
        console.error('Error in getUserSettings:', error);
        return {
            success: false,
            error: error.message,
            data: DEFAULT_SETTINGS // Return defaults on error
        };
    }
}

/**
 * Update user settings (upsert - creates if doesn't exist)
 * @param {string} userId - The user's UUID
 * @param {Object} settings - Settings to update
 * @param {string} settings.weight_unit - 'lbs' or 'kg'
 * @param {string} settings.distance_unit - 'miles' or 'km'
 * @returns {Object} Updated settings
 */
async function updateUserSettings(userId, settings) {
    try {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid userId is required');
        }

        // Validate settings
        const validWeightUnits = ['lbs', 'kg'];
        const validDistanceUnits = ['miles', 'km'];

        if (settings.weight_unit && !validWeightUnits.includes(settings.weight_unit)) {
            throw new Error(`Invalid weight_unit. Must be one of: ${validWeightUnits.join(', ')}`);
        }

        if (settings.distance_unit && !validDistanceUnits.includes(settings.distance_unit)) {
            throw new Error(`Invalid distance_unit. Must be one of: ${validDistanceUnits.join(', ')}`);
        }

        // Build update object with only provided fields
        const updateData = {
            user_id: userId
        };

        if (settings.weight_unit) {
            updateData.weight_unit = settings.weight_unit;
        }

        if (settings.distance_unit) {
            updateData.distance_unit = settings.distance_unit;
        }

        // Upsert the settings
        const { data, error } = await supabase
            .from('user_settings')
            .upsert(updateData, {
                onConflict: 'user_id',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (error) {
            console.error('Error updating user settings:', error);
            throw error;
        }

        return {
            success: true,
            data: {
                weight_unit: data.weight_unit,
                distance_unit: data.distance_unit
            }
        };

    } catch (error) {
        console.error('Error in updateUserSettings:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    getUserSettings,
    updateUserSettings,
    DEFAULT_SETTINGS
};

