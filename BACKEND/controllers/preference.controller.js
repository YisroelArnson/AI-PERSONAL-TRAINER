const { parsePreferenceText } = require('../services/preference.service');

/**
 * Parse user preference text using AI
 * POST /preferences/parse
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function parsePreference(req, res) {
  try {
    const { preferenceText, currentPreference } = req.body;

    // Validate required fields
    if (!preferenceText || typeof preferenceText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'preferenceText is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    if (preferenceText.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'preferenceText cannot be empty',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Parsing preference: "${preferenceText}"`);
    if (currentPreference) {
      console.log('Current preference context:', currentPreference);
    }

    // Parse the preference text using AI with optional context
    const parsedPreference = await parsePreferenceText(preferenceText, currentPreference);

    console.log('Successfully parsed preference:', parsedPreference);

    return res.status(200).json({
      success: true,
      data: parsedPreference,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in parsePreference controller:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to parse preference',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  parsePreference
};

