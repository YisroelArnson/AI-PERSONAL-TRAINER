const { parseMuscleGoalsText } = require('../services/muscleGoals.service');

/**
 * Parse user muscle goals text using AI
 * POST /muscle-goals/parse
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function parseMuscleGoals(req, res) {
  try {
    const { goalsText, currentGoals } = req.body;

    // Validate required fields
    if (!goalsText || typeof goalsText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'goalsText is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    if (goalsText.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'goalsText cannot be empty',
        timestamp: new Date().toISOString()
      });
    }

    // Validate currentGoals if provided
    if (currentGoals && typeof currentGoals !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'currentGoals must be an object (dictionary of muscle names to weights)',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Parsing muscle goals: "${goalsText}"`);
    if (currentGoals) {
      console.log('Current muscle goals context:', currentGoals);
    }

    // Parse the goals text using AI with optional context
    const parsedGoals = await parseMuscleGoalsText(goalsText, currentGoals);

    console.log('Successfully parsed muscle goals:', parsedGoals);

    return res.status(200).json({
      success: true,
      data: parsedGoals,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in parseMuscleGoals controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to parse muscle goals',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  parseMuscleGoals
};

