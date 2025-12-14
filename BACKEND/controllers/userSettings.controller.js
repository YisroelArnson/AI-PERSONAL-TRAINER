const { getUserSettings, updateUserSettings } = require('../services/userSettings.service');

/**
 * GET /api/user-settings
 * Get current user's settings
 */
async function getSettings(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const result = await getUserSettings(userId);

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(500).json(result);
        }

    } catch (error) {
        console.error('Error in getSettings controller:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * PUT /api/user-settings
 * Update current user's settings
 */
async function putSettings(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { weight_unit, distance_unit } = req.body;

        // Validate that at least one setting is provided
        if (!weight_unit && !distance_unit) {
            return res.status(400).json({
                success: false,
                error: 'At least one setting (weight_unit or distance_unit) must be provided'
            });
        }

        const result = await updateUserSettings(userId, {
            weight_unit,
            distance_unit
        });

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }

    } catch (error) {
        console.error('Error in putSettings controller:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getSettings,
    putSettings
};

