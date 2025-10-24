const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');
const { z } = require('zod');

// The 16 preset muscle categories (must match iOS app)
const PRESET_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Lower Back',
  'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Trapezius',
  'Abductors', 'Adductors', 'Forearms', 'Neck'
];

/**
 * Parse user's muscle goals text using AI
 * @param {string} goalsText - The user's text input describing their muscle focus
 * @param {Object} currentGoals - Optional current muscle weights context (dict of muscle -> weight)
 * @returns {Object} Parsed muscle weights for all 16 preset muscles with reasoning
 */
async function parseMuscleGoalsText(goalsText, currentGoals = null) {
  // Validate goalsText
  if (!goalsText || typeof goalsText !== 'string' || goalsText.trim() === '') {
    throw new Error('Invalid goals text provided');
  }

  try {
    // Build the context section for the prompt
    let contextSection = '';
    if (currentGoals && Object.keys(currentGoals).length > 0) {
      contextSection = `\n\nCURRENT MUSCLE WEIGHTS:\n${JSON.stringify(currentGoals, null, 2)}\n\nThe user is refining their muscle goals. Adjust weights based on their input while maintaining the preset muscle list.`;
    }

    // Use AI to parse and structure the muscle goals
    const { object: parsedGoals } = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        weights: z.object({
          Chest: z.number().min(0).max(1),
          Back: z.number().min(0).max(1),
          Shoulders: z.number().min(0).max(1),
          Biceps: z.number().min(0).max(1),
          Triceps: z.number().min(0).max(1),
          Abs: z.number().min(0).max(1),
          'Lower Back': z.number().min(0).max(1),
          Quadriceps: z.number().min(0).max(1),
          Hamstrings: z.number().min(0).max(1),
          Glutes: z.number().min(0).max(1),
          Calves: z.number().min(0).max(1),
          Trapezius: z.number().min(0).max(1),
          Abductors: z.number().min(0).max(1),
          Adductors: z.number().min(0).max(1),
          Forearms: z.number().min(0).max(1),
          Neck: z.number().min(0).max(1)
        }).describe('Weight distribution across all 16 preset muscle groups'),
        reasoning: z.string().describe('Brief explanation of why these muscle weights were chosen')
      }),
      prompt: `Parse the user's muscle training goals and return weight distributions for all 16 preset muscle groups.
${contextSection}

User input: "${goalsText}"

You MUST return weights for ALL 16 muscle groups:
- Chest, Back, Shoulders, Biceps, Triceps, Abs, Lower Back
- Quadriceps, Hamstrings, Glutes, Calves
- Trapezius, Abductors, Adductors, Forearms, Neck

Rules:
1. All weights must sum to exactly 1.0
2. Use 0.0 for muscles the user doesn't want to focus on
3. Distribute weights based on user's stated priorities
4. Consider muscle group relationships (e.g., chest training involves triceps)

Examples:

1. "Focus on glutes and hamstrings":
{
  "weights": {
    "Chest": 0.02, "Back": 0.05, "Shoulders": 0.02, "Biceps": 0.02, "Triceps": 0.02,
    "Abs": 0.05, "Lower Back": 0.08, "Quadriceps": 0.10, "Hamstrings": 0.25,
    "Glutes": 0.30, "Calves": 0.04, "Trapezius": 0.02, "Abductors": 0.02,
    "Adductors": 0.01, "Forearms": 0.0, "Neck": 0.0
  },
  "reasoning": "Prioritized glutes (30%) and hamstrings (25%) as requested, with supporting work for lower back, quads, and abs"
}

2. "Upper body focus, especially chest and back":
{
  "weights": {
    "Chest": 0.20, "Back": 0.20, "Shoulders": 0.12, "Biceps": 0.08, "Triceps": 0.08,
    "Abs": 0.06, "Lower Back": 0.04, "Quadriceps": 0.06, "Hamstrings": 0.06,
    "Glutes": 0.04, "Calves": 0.02, "Trapezius": 0.02, "Abductors": 0.01,
    "Adductors": 0.01, "Forearms": 0.0, "Neck": 0.0
  },
  "reasoning": "Equal emphasis on chest and back (20% each), supporting shoulders and arms, minimal lower body maintenance"
}

3. "Balanced full body":
{
  "weights": {
    "Chest": 0.0625, "Back": 0.0625, "Shoulders": 0.0625, "Biceps": 0.0625,
    "Triceps": 0.0625, "Abs": 0.0625, "Lower Back": 0.0625, "Quadriceps": 0.0625,
    "Hamstrings": 0.0625, "Glutes": 0.0625, "Calves": 0.0625, "Trapezius": 0.0625,
    "Abductors": 0.0625, "Adductors": 0.0625, "Forearms": 0.0625, "Neck": 0.0625
  },
  "reasoning": "Even distribution across all 16 muscle groups (6.25% each) for balanced development"
}

CRITICAL: Ensure all 16 muscle weights sum to exactly 1.0. Normalize if needed.

Current time: ${new Date().toISOString()}`
    });

    // Normalize weights to ensure they sum to 1.0
    const muscleWeights = parsedGoals.weights;
    const totalWeight = Object.values(muscleWeights).reduce((sum, weight) => sum + weight, 0);
    
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      // Normalize each weight
      Object.keys(muscleWeights).forEach(muscle => {
        muscleWeights[muscle] = muscleWeights[muscle] / totalWeight;
      });
    }

    console.log('Parsed muscle goals:', parsedGoals);

    return {
      weights: muscleWeights,
      reasoning: parsedGoals.reasoning
    };

  } catch (error) {
    console.error('Error parsing muscle goals:', error);
    throw new Error(`Failed to parse muscle goals: ${error.message}`);
  }
}

module.exports = {
  parseMuscleGoalsText
};

