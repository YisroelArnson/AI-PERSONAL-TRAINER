const { openai } = require('@ai-sdk/openai');
const { generateText, streamText } = require('ai');
const { createAllTools } = require('../ai/tools');

/**
 * Process user request and generate exercise recommendations
 * @param {string} userInput - The user's text input
 * @param {string} userId - The user ID for context
 * @param {Object} options - Additional options
 * @param {boolean} options.enableStreaming - Whether to enable streaming for recommendations
 * @param {Function} options.onExercise - Callback for streamed exercises
 * @param {Function} options.onTextDelta - Callback for streamed text chunks
 * @returns {Object} Response with exercise recommendations
 */
async function processUserRequest(userInput, userId, options = {}) {
  const systemPrompt = `You are a personal fitness AI assistant. You can both use tools for specific actions AND provide direct informational responses.

WHEN TO USE TOOLS vs DIRECT RESPONSES:

**USE TOOLS for these actions:**
1. When a user mentions completing an exercise → use logExercise tool
2. When a user requests exercise recommendations → use parsePreference + recommendExercise tools
3. When a user expresses preferences/limitations → use parsePreference tool

**PROVIDE DIRECT RESPONSES for these queries:**
1. Questions about exercise form/technique ("How do I do pushups?", "What's proper squat form?")
2. General fitness information ("What muscles do deadlifts work?", "Benefits of cardio?")
3. Exercise explanations ("What is a burpee?", "How to do a plank?")
4. Fitness advice ("How often should I workout?", "What's a good warmup?")
5. Conversational responses ("Hello", "Thank you", general chat)

TOOL USAGE EXAMPLES:
- "I did 15 pushups" → logExercise({exerciseName: "pushups", reps: 15})
- "I want to do exercise for my hamstrings" → parsePreference({userInput: "I want to do exercise for my hamstrings"}) → recommendExercise()
- "I don't like burpees" → parsePreference({userInput: "I don't like burpees"})

DIRECT RESPONSE EXAMPLES:
- "How do I do a proper pushup?" → Provide detailed form instructions directly
- "What muscles do squats work?" → Explain the muscle groups involved
- "What's the difference between HIIT and cardio?" → Explain the concepts directly
- "Hello" → Respond conversationally without using tools

**CRITICAL: When a user requests exercises (phrases like "I want to do exercise", "give me exercises"), ALWAYS follow this sequence:**
- First use parsePreference to capture their request
- Then IMMEDIATELY use recommendExercise to provide the exercises

Be conversational, encouraging, knowledgeable about fitness, and provide helpful direct answers when appropriate. Use tools only when specific actions are needed.`;

  // If streaming is enabled, use streamText
  if (options.enableStreaming) {
    const result = await streamText({
      model: openai('gpt-4o'),
      tools: createAllTools(userId, options),
      maxSteps: 5,
      system: systemPrompt,
      prompt: userInput,
    });

    let fullResponse = '';
    
    // Stream the text response if callback provided
    console.log('Starting text streaming...');
    if (options.onTextDelta) {
      for await (const textDelta of result.textStream) {
        console.log('Text delta:', textDelta);
        fullResponse += textDelta;
        options.onTextDelta(textDelta);
      }
    } else {
      // If no streaming callback, just collect the full response
      for await (const textDelta of result.textStream) {
        console.log('Text delta (no callback):', textDelta);
        fullResponse += textDelta;
      }
    }
    console.log('Text streaming completed. Full response:', fullResponse);

    return {
      success: true,
      response: fullResponse,
      streaming: true
    };
  } else {
    // Use regular generateText for non-streaming
    const { text: response } = await generateText({
      model: openai('gpt-4o'),
      tools: createAllTools(userId, options),
      maxSteps: 5,
      system: systemPrompt,
      prompt: userInput,
    });

    return {
      success: true,
      response: response,
      streaming: false
    };
  }
}

module.exports = { processUserRequest };