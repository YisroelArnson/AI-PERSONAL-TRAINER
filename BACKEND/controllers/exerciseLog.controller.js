const { logCompletedExercise, getWorkoutHistory } = require('../services/exerciseLog.service');

/**
 * Controller for logging a completed exercise
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function logExercise(req, res) {
  try {
    const { userId } = req.params;
    const exerciseData = req.body;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Logging exercise for user: ${userId}`);

    // Log the exercise
    const result = await logCompletedExercise(userId, exerciseData);

    if (result.success) {
      console.log(`Successfully logged exercise: ${exerciseData.exercise_name} for user: ${userId}`);
      
      return res.status(201).json({
        success: true,
        data: result.data,
        timestamp: result.timestamp
      });
    } else {
      console.error(`Failed to log exercise for user ${userId}:`, result.error);
      
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in logExercise controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Controller for fetching workout history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getHistory(req, res) {
  try {
    const { userId } = req.params;
    const { limit, startDate, endDate } = req.query;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Fetching workout history for user: ${userId}`);

    // Fetch workout history
    const result = await getWorkoutHistory(userId, {
      limit: limit ? parseInt(limit) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    if (result.success) {
      console.log(`Successfully fetched ${result.count} workout records for user: ${userId}`);
      
      return res.status(200).json({
        success: true,
        data: result.data,
        count: result.count,
        timestamp: result.timestamp
      });
    } else {
      console.error(`Failed to fetch workout history for user ${userId}:`, result.error);
      
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in getHistory controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  logExercise,
  getHistory
};

