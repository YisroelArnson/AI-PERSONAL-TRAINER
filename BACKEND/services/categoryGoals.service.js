const { openai } = require('@ai-sdk/openai');
const { generateObject } = require('ai');
const { z } = require('zod');

/**
 * Parse user's category goals text using AI
 * @param {string} goalsText - The user's text input describing their fitness goals
 * @param {Array} currentGoals - Optional current goals context for refinement
 * @returns {Object} Parsed category goals with weights that sum to 1.0
 */
async function parseCategoryGoalsText(goalsText, currentGoals = null) {
  // Validate goalsText
  if (!goalsText || typeof goalsText !== 'string' || goalsText.trim() === '') {
    throw new Error('Invalid goals text provided');
  }

  try {
    // Build the context section for the prompt
    let contextSection = '';
    if (currentGoals && currentGoals.length > 0) {
      contextSection = `\n\nCURRENT GOALS:\n${JSON.stringify(currentGoals, null, 2)}\n\nThe user is refining their goals. Merge or replace as appropriate based on their input.`;
    }

    // Use AI to parse and structure the category goals
    const { object: parsedGoals } = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        goals: z.array(z.object({
          category: z.string().describe('Short category name (2-4 words)'),
          description: z.string().describe('Detailed description explaining what this category represents'),
          weight: z.number().min(0).max(1).describe('Weight/importance between 0 and 1')
        })),
        reasoning: z.string().describe('Brief explanation of why these goals and weights were chosen')
      }),
      prompt: `Parse the user's fitness goals and return a structured list of category goals with weights that sum to 1.0.
${contextSection}

User input: "${goalsText}"

Return as many category goals as the user wants to represent the user's fitness priorities. Each goal should have:
- category: A concise name (e.g., "Strength", "Cardio", "Flexibility", "Stability & Mobility")
- description: A detailed explanation of what exercises/focus this category represents
- weight: A number between 0 and 1 representing importance (all weights must sum to exactly 1.0)

Examples of good category goals:

1. Longevity/Peter Attia focused:
{
  "goals": [
    {
      "category": "Stability & Mobility",
      "description": "Foundation exercises that improve joint control and usable range of motion",
      "weight": 0.15
    },
    {
      "category": "Strength",
      "description": "Compound lifts and progressive overload across major movement patterns",
      "weight": 0.45
    },
    {
      "category": "Zone 2 Cardio",
      "description": "Steady aerobic work for metabolic and mitochondrial health",
      "weight": 0.20
    },
    {
      "category": "VO₂ Max Training",
      "description": "High-intensity intervals to improve peak cardiovascular capacity",
      "weight": 0.20
    }
  ],
  "reasoning": "Balanced approach for longevity with emphasis on strength foundation"
}

2. Muscle building focused:
{
  "goals": [
    {
      "category": "Hypertrophy Training",
      "description": "High volume resistance training to maximize muscle growth",
      "weight": 0.70
    },
    {
      "category": "Cardio",
      "description": "Cardiovascular work to maintain heart health",
      "weight": 0.20
    },
    {
      "category": "Recovery & Mobility",
      "description": "Active recovery and flexibility work",
      "weight": 0.10
    }
  ],
  "reasoning": "Muscle building focused with minimal cardio maintenance"
}

CRITICAL: Ensure all weights sum to exactly 1.0. Normalize if needed.

Current time: ${new Date().toISOString()}`
    });

    // Normalize weights to ensure they sum to 1.0
    const totalWeight = parsedGoals.goals.reduce((sum, goal) => sum + goal.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      parsedGoals.goals.forEach(goal => {
        goal.weight = goal.weight / totalWeight;
      });
    }

    console.log('Parsed category goals:', parsedGoals);

    return parsedGoals;

  } catch (error) {
    console.error('Error parsing category goals:', error);
    throw new Error(`Failed to parse category goals: ${error.message}`);
  }
}

module.exports = {
  parseCategoryGoalsText
};

