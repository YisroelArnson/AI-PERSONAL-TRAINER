const { getDistributionMetrics, resetTracking } = require('../services/exerciseDistribution.service');

/**
 * Controller for getting distribution metrics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDistribution(req, res) {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Fetching distribution metrics for user: ${userId}`);

    // Get distribution metrics
    const metrics = await getDistributionMetrics(userId);

    return res.status(200).json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getDistribution controller:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Controller for resetting distribution tracking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function resetDistributionTracking(req, res) {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Resetting distribution tracking for user: ${userId}`);

    // Reset tracking
    const result = await resetTracking(userId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Distribution tracking reset successfully',
        timestamp: result.timestamp
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to reset tracking',
        details: result.error,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in resetDistributionTracking controller:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  getDistribution,
  resetDistributionTracking
};

