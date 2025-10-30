const { generateExerciseRecommendations, streamExerciseRecommendations } = require('../services/recommend.service');
const { cleanupPreferences } = require('../ai/tools/parsePreference');

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

/**
 * Controller for handling streaming exercise recommendation requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function streamRecommendExercises(req, res) {
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

    console.log(`Processing streaming exercise recommendation request for user: ${userId}`);
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Generate streaming exercise recommendations
    const result = await streamExerciseRecommendations(userId, requestData);

    if (result.success) {
      console.log(`Successfully started streaming recommendations for user: ${userId}`);
      
      // Send initial metadata
      res.write(JSON.stringify({
        type: 'metadata',
        success: true,
        userId: result.userId,
        timestamp: result.timestamp,
        metadata: result.metadata
      }) + '\n');

      let exerciseCount = 0;
      
      try {
        // Stream individual exercises as they're generated
        for await (const exercise of result.elementStream) {
          exerciseCount++;
          res.write(JSON.stringify({
            type: 'exercise',
            data: exercise,
            index: exerciseCount - 1
          }) + '\n');
          
          console.log(`Streamed exercise ${exerciseCount} for user: ${userId}`);
        }
        
        // Send completion signal
        res.write(JSON.stringify({
          type: 'complete',
          totalExercises: exerciseCount,
          timestamp: new Date().toISOString()
        }) + '\n');
        
        console.log(`Completed streaming ${exerciseCount} exercises for user: ${userId}`);
        
        // Clean up preferences marked for deletion after call (safety net)
        try {
          const cleanupResult = await cleanupPreferences(userId);
          console.log(`Controller cleanup: deleted ${cleanupResult.deletedCount || 0} preferences`);
        } catch (cleanupError) {
          console.error('Error cleaning up preferences in controller:', cleanupError);
          // Don't fail the request for cleanup errors
        }
        
      } catch (streamError) {
        console.error('Error during streaming:', streamError);
        res.write(JSON.stringify({
          type: 'error',
          error: 'Streaming interrupted',
          details: streamError.message,
          timestamp: new Date().toISOString()
        }) + '\n');
      }
      
      res.end();
      
    } else {
      console.error(`Failed to start streaming for user ${userId}:`, result.error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to start streaming exercise recommendations',
        details: result.error,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in streamRecommendExercises controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  recommendExercises,
  streamRecommendExercises
};
