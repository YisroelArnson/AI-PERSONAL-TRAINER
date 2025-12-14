const { generateExerciseIntervals, generateBatchIntervals } = require('../services/interval.service');

/**
 * Controller for generating interval timer data for a single exercise
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExerciseIntervals(req, res) {
  try {
    const { exercise } = req.body;

    // Validate exercise object
    if (!exercise) {
      return res.status(400).json({
        success: false,
        error: 'Exercise object is required in request body',
        timestamp: new Date().toISOString()
      });
    }

    if (!exercise.exercise_name || !exercise.exercise_type) {
      return res.status(400).json({
        success: false,
        error: 'Exercise must have exercise_name and exercise_type',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Processing interval request for exercise: ${exercise.exercise_name}`);

    // Generate interval data
    const result = await generateExerciseIntervals(exercise);

    if (result.success) {
      console.log(`Successfully generated intervals for: ${exercise.exercise_name}`);

      return res.status(200).json({
        success: true,
        data: result.data,
        timestamp: result.timestamp
      });
    } else {
      console.error(`Failed to generate intervals for ${exercise.exercise_name}:`, result.error);

      return res.status(500).json({
        success: false,
        error: 'Failed to generate exercise intervals',
        details: result.error,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in getExerciseIntervals controller:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Controller for generating interval timer data for multiple exercises
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBatchIntervals(req, res) {
  try {
    const { exercises } = req.body;

    // Validate exercises array
    if (!exercises) {
      return res.status(400).json({
        success: false,
        error: 'Exercises array is required in request body',
        timestamp: new Date().toISOString()
      });
    }

    if (!Array.isArray(exercises)) {
      return res.status(400).json({
        success: false,
        error: 'Exercises must be an array',
        timestamp: new Date().toISOString()
      });
    }

    if (exercises.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Exercises array cannot be empty',
        timestamp: new Date().toISOString()
      });
    }

    // Validate each exercise has required fields
    const invalidExercises = exercises.filter(
      (e, i) => !e.exercise_name || !e.exercise_type
    );

    if (invalidExercises.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All exercises must have exercise_name and exercise_type',
        invalidCount: invalidExercises.length,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Processing batch interval request for ${exercises.length} exercises`);

    // Generate batch interval data
    const result = await generateBatchIntervals(exercises);

    if (result.success) {
      console.log(`Successfully generated batch intervals: ${result.metadata.successful}/${result.metadata.total}`);

      return res.status(200).json({
        success: true,
        data: result.data,
        metadata: result.metadata,
        timestamp: result.timestamp
      });
    } else {
      console.error('Failed to generate batch intervals:', result.error);

      return res.status(500).json({
        success: false,
        error: 'Failed to generate batch intervals',
        details: result.error,
        timestamp: result.timestamp
      });
    }

  } catch (error) {
    console.error('Error in getBatchIntervals controller:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  getExerciseIntervals,
  getBatchIntervals
};


