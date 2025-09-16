const { generateExerciseRecommendations } = require('../services/recommend.service');

/**
 * Controller for handling exercise recommendation requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function recommendExercises(req, res) {
  try {
    const { userId } = req.params;
    const requestData = req.body || {};

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Processing exercise recommendation request for user: ${userId}`);
    
    // Generate exercise recommendations
    const result = await generateExerciseRecommendations(userId, requestData);

    if (result.success) {
      console.log(`Successfully generated ${result.metadata.recommendationCount} exercise recommendations for user: ${userId}`);
      
      return res.status(200).json({
        success: true,
        data: result.data,
        metadata: result.metadata,
        timestamp: result.timestamp
      });
    } else {
      console.error(`Failed to generate recommendations for user ${userId}:`, result.error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to generate exercise recommendations',
        details: result.error,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in recommendExercises controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  recommendExercises
};
