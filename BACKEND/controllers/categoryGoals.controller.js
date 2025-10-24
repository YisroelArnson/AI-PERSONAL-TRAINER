const { parseCategoryGoalsText } = require('../services/categoryGoals.service');

/**
 * Parse user category goals text using AI
 * POST /category-goals/parse
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function parseCategoryGoals(req, res) {
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

    console.log(`Parsing category goals: "${goalsText}"`);
    if (currentGoals) {
      console.log('Current goals context:', currentGoals);
    }

    // Parse the goals text using AI with optional context
    const parsedGoals = await parseCategoryGoalsText(goalsText, currentGoals);

    console.log('Successfully parsed category goals:', parsedGoals);

    return res.status(200).json({
      success: true,
      data: parsedGoals,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in parseCategoryGoals controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to parse category goals',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  parseCategoryGoals
};

