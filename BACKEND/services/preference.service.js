const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');
const { z } = require('zod');

/**
 * Parse user preference text using AI
 * @param {string} userInput - The user's text input describing their preference
 * @param {Object} currentPreference - Optional current preference context for refinement
 * @returns {Object} Parsed preference object
 */
async function parsePreferenceText(userInput, currentPreference = null) {
  // Validate userInput
  if (!userInput || typeof userInput !== 'string' || userInput.trim() === '') {
    throw new Error('Invalid user input provided');
  }

  try {
    // Build the context section for the prompt
    let contextSection = '';
    if (currentPreference) {
      contextSection = `

CURRENT PREFERENCE STATE:
${JSON.stringify(currentPreference, null, 2)}

The user is refining or modifying the above preference. Interpret their new input as an adjustment, addition, or modification to the existing preference. Merge the new information with the existing preference intelligently:
- If the new input contradicts the existing preference, update it
- If the new input adds to the existing preference, merge them
- Maintain consistency in the type unless the user is clearly changing the preference type
- Keep existing fields unless the new input explicitly changes them
`;
    }

    // Use AI to parse and structure the preference
    const { object: parsedPreference } = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        type: z.enum([
          'workout',         // Preferences about workout type, style, or modality (e.g., "I want HIIT", "I prefer yoga")
          'injury',          // Preferences or limitations due to injury or pain (e.g., "My knee hurts", "I have a bad back")
          'time',            // Preferences about timing, duration, or schedule (e.g., "I only have 20 minutes", "Morning workouts only")
          'equipment',       // Preferences about equipment availability or restrictions (e.g., "No equipment", "I have dumbbells")
          'intensity',       // Preferences about workout intensity (e.g., "Take it easy today", "I want a hard workout")
          'muscle_group',    // Preferences about muscle groups to target or avoid (e.g., "Focus on legs", "Avoid shoulders")
          'exercise',        // Preferences about specific exercises (e.g., "No burpees", "I like squats")
          'goal',            // Preferences about fitness goals (e.g., "Build muscle", "Lose weight")
          'recovery',        // Preferences about recovery or rehabilitation (e.g., "Shoulder recovery", "Active recovery only")
          'other'            // Any other type of preference not covered above
        ]),
        description: z.string(),
        recommendationsGuidance: z.string(),
        expireTime: z.string().nullable(),
        deleteAfterCall: z.boolean(),
        reasoning: z.string()
      }),
      prompt: `Parse this user input and return the actual preference data (NOT a schema):
${contextSection}
User input: "${userInput}"

You must return actual data values, not a JSON schema. 

IMPORTANT: Detect the temporal nature of the user's preference:

**IMMEDIATE EXERCISE REQUESTS** (phrases like "I want to do exercise", "give me exercises", "I need a workout", "show me exercises") should be DELETED AFTER CALL:
- expireTime: null (no expiration needed since it will be deleted immediately after use)
- deleteAfterCall: true

**TIME-LIMITED PREFERENCES** (phrases indicating temporary conditions like "for the next week", "until my injury heals", "for the next 2 weeks", "this month only", "today only") should have EXPIRATION TIME:
- expireTime: ISO 8601 timestamp when the preference should expire (calculate from current time + user's specified duration)
- deleteAfterCall: false

**GENERAL PREFERENCES** (phrases like "I don't like", "I hate", "I prefer", "I always", "never") should be PERMANENT:
- expireTime: null  
- deleteAfterCall: false

**RULES:**
1. If deleteAfterCall is true, then expireTime MUST be null (since the preference will be deleted immediately after the recommendation call)
2. If the user specifies a time duration (e.g., "for 2 weeks", "until next month"), calculate expireTime from the current time
3. If expireTime is set, deleteAfterCall MUST be false
4. Use ISO 8601 format for expireTime (e.g., "2025-06-20T10:30:00.000Z")

Examples:

For "I want to do exercise for my hamstrings" (IMMEDIATE REQUEST), return:
{
  "type": "muscle_group",
  "description": "User wants exercises targeting the hamstrings right now",
  "recommendationsGuidance": "Include exercises that focus on the hamstring muscles",
  "expireTime": null,
  "deleteAfterCall": true,
  "reasoning": "Immediate exercise request will be deleted after providing recommendations"
}

For "I don't like burpees" (GENERAL PREFERENCE), return:
{
  "type": "exercise",
  "description": "User dislikes burpee exercises",
  "recommendationsGuidance": "Avoid burpees in exercise recommendations",
  "expireTime": null,
  "deleteAfterCall": false,
  "reasoning": "General dislike indicates permanent preference"
}

For "Avoid shoulder exercises for the next 2 weeks" (TIME-LIMITED PREFERENCE), return:
{
  "type": "injury",
  "description": "User needs to avoid shoulder exercises temporarily",
  "recommendationsGuidance": "Exclude all shoulder-focused exercises from recommendations",
  "expireTime": "2025-06-20T10:30:00.000Z",
  "deleteAfterCall": false,
  "reasoning": "Temporary restriction for 2 weeks, will expire automatically"
}

For "Take it easy this week" (TIME-LIMITED PREFERENCE), return:
{
  "type": "intensity",
  "description": "User wants lower intensity workouts this week",
  "recommendationsGuidance": "Recommend low to moderate intensity exercises only",
  "expireTime": "2025-06-13T10:30:00.000Z",
  "deleteAfterCall": false,
  "reasoning": "Temporary intensity preference for one week"
}

Classify the type as one of: workout, injury, time, equipment, intensity, muscle_group, exercise, goal, recovery, other

Current time: ${new Date().toISOString()}`
    });

    console.log('Parsed preference:', parsedPreference);

    return {
      type: parsedPreference.type,
      description: parsedPreference.description,
      recommendationsGuidance: parsedPreference.recommendationsGuidance,
      expireTime: parsedPreference.expireTime,
      deleteAfterCall: parsedPreference.deleteAfterCall,
      reasoning: parsedPreference.reasoning
    };

  } catch (error) {
    console.error('Error parsing preference:', error);
    throw new Error(`Failed to parse preference: ${error.message}`);
  }
}

module.exports = {
  parsePreferenceText
};

