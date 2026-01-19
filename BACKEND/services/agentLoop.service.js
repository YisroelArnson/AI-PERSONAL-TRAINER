// BACKEND/services/agentLoop.service.js
// Main agent loop - orchestrates tool execution with pure XML prompts
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { buildAgentContext, estimateTokens } = require('./contextBuilder.service');
const { initializeContext } = require('./initializerAgent.service');
const { executeTool, getToolStatusMessage } = require('../agent/tools');
const sessionObs = require('./sessionObservability.service');
const { formatCurrentWorkout } = require('./dataFormatters.service');

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_ITERATIONS = 10;
const MODEL = 'gpt-4o';

/**
 * JSON Schema for structured outputs - guarantees valid tool calls
 * OpenAI will enforce this schema, eliminating parsing failures
 */
const TOOL_CALL_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "tool_call",
    strict: true,
    schema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          enum: [
            "message_notify_user",
            "message_ask_user",
            "idle",
            "generate_workout",
            "swap_exercise",
            "adjust_exercise",
            "remove_exercise",
            "log_workout",
            "set_goals",
            "set_preference",
            "delete_preference",
            "set_current_location",
            "fetch_data"
          ]
        },
        arguments: {
          type: "object",
          additionalProperties: true
        }
      },
      required: ["tool", "arguments"],
      additionalProperties: false
    }
  }
};

/**
 * Parse tool call from JSON response (structured output)
 * @param {string} responseText - The LLM response text (JSON)
 * @returns {Object|null} Parsed tool call or null
 */
function parseToolCallFromJson(responseText) {
  try {
    const parsed = JSON.parse(responseText);

    if (!parsed.tool || !parsed.arguments) {
      return null;
    }

    return {
      id: `call_${Date.now()}`,
      name: parsed.tool,
      arguments: parsed.arguments
    };
  } catch (e) {
    // This should never happen with structured outputs, but handle gracefully
    console.error('Failed to parse JSON tool call:', e.message);
    return null;
  }
}

/**
 * Call the LLM with XML prompt and JSON structured output for tool calls
 * @param {Object} context - Built context with prompt string
 * @returns {Object} OpenAI API response
 */
async function callLLM(context) {
  const { prompt } = context;

  // Send as a single user message with structured output for guaranteed tool calls
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'user', content: prompt }
    ],
    response_format: TOOL_CALL_SCHEMA
  });

  return response;
}

/**
 * Main agent loop
 * Processes user input, manages context, and executes tools
 * @param {string} userId - The user's UUID
 * @param {string} userInput - The user's message
 * @param {Object} options - Optional parameters (sessionId, onEvent callback, currentWorkout)
 * @param {Function} options.onEvent - Optional callback for real-time event streaming
 *        Called with { type: 'tool_start' | 'tool_result' | 'message', tool?, data? }
 * @param {Object} options.currentWorkout - Current workout session state from client
 * @returns {Object} Result with sessionId, actions, and iterations
 */
async function runAgentLoop(userId, userInput, options = {}) {
  const { sessionId: existingSessionId, onEvent, currentWorkout } = options;
  
  // Helper to emit events if callback provided
  const emit = (eventType, data) => {
    if (onEvent && typeof onEvent === 'function') {
      try {
        onEvent({ type: eventType, ...data });
      } catch (e) {
        console.error('Error in onEvent callback:', e);
      }
    }
  };
  
  // Get or create session
  const session = existingSessionId 
    ? await sessionObs.getSession(existingSessionId)
    : await sessionObs.getOrCreateSession(userId);
  
  const sessionId = session.id;

  try {
    // Log user message
    await sessionObs.logUserMessage(sessionId, userInput);

    // If client provided current workout state, inject it as knowledge
    // This is client-provided data, not fetched from database
    if (currentWorkout && currentWorkout.exercises && currentWorkout.exercises.length > 0) {
      const formattedWorkout = formatCurrentWorkout(currentWorkout);
      await sessionObs.logKnowledge(sessionId, 'current_workout_session', formattedWorkout);
      sessionObs.consoleLog(
        sessionId,
        '🏋️',
        'Injected current workout session',
        `${currentWorkout.exercises.length} exercises, viewing #${(currentWorkout.currentIndex || 0) + 1}`
      );
    }

    // Initialize context with relevant data
    // Pass emit callback so knowledge events can be streamed to client
    try {
      await initializeContext(sessionId, userId, userInput, emit);
    } catch (error) {
      await sessionObs.logError(sessionId, error, 'context_init');
      // Continue anyway - the main agent can still work with limited context
    }

    let iteration = 0;
    let shouldContinue = true;
    const actions = [];
    let totalDurationMs = 0;

    while (shouldContinue && iteration < MAX_ITERATIONS) {
      iteration++;

      // Build XML context (uses context events from the session)
      const context = await buildAgentContext(sessionId, userId);
      
      // Check token estimate
      const tokenEstimate = estimateTokens(context);
      
      // Log LLM request
      await sessionObs.logLLMRequest(sessionId, MODEL, context.prompt, tokenEstimate);

      // Call LLM
      const startTime = Date.now();
      let response;
      let toolCall;
      let responseText;
      
      try {
        response = await callLLM(context);
        const durationMs = Date.now() - startTime;
        totalDurationMs += durationMs;
        
        responseText = response.choices[0].message.content || '';
        toolCall = parseToolCallFromJson(responseText);
        
        // Log LLM response (pass raw response for observability)
        await sessionObs.logLLMResponse(sessionId, {
          rawResponse: response,
          durationMs
        });
        
      } catch (error) {
        await sessionObs.logError(sessionId, error, 'llm_call');
        throw error;
      }

      if (!toolCall) {
        // This should rarely happen with structured outputs
        await sessionObs.logError(sessionId, 'Failed to parse structured output', 'parse_response', {
          responsePreview: responseText.substring(0, 300)
        });
        break;
      }

      // Log tool call
      await sessionObs.logToolCall(sessionId, toolCall.name, toolCall.arguments, toolCall.id);
      
      // Get status message for this tool (if any)
      const statusMessage = getToolStatusMessage(toolCall.name);
      
      // Emit tool start event for real-time streaming
      emit('tool_start', { tool: toolCall.name, args: toolCall.arguments });
      
      // Emit status update if tool has a status message
      if (statusMessage?.start) {
        emit('status', { message: statusMessage.start, tool: toolCall.name, phase: 'start' });
      }

      // Execute tool
      const executionContext = { userId, sessionId };
      const toolStartTime = Date.now();
      
      try {
        const { result, formatted, rawFormatted } = await executeTool(
          toolCall.name,
          toolCall.arguments,
          executionContext
        );

        const toolDurationMs = Date.now() - toolStartTime;

        // Log tool result with raw formatted version for LLM context
        // The contextBuilder will wrap it in <result> tags
        await sessionObs.logToolResult(sessionId, toolCall.name, rawFormatted, true, toolCall.id, toolDurationMs);

        actions.push({
          tool: toolCall.name,
          args: toolCall.arguments,
          result,
          formatted
        });
        
        // Emit status completion if tool has a status message
        if (statusMessage?.done) {
          emit('status', { message: statusMessage.done, tool: toolCall.name, phase: 'done' });
        }
        
        // Emit tool result for real-time streaming
        // This sends message_notify_user, message_ask_user, etc. IMMEDIATELY
        emit('tool_result', { tool: toolCall.name, result, formatted, success: true });

        // Check for idle (completion signal)
        if (toolCall.name === 'idle') {
          shouldContinue = false;
        }

        // Check for question (wait for user response)
        if (toolCall.name === 'message_ask_user') {
          shouldContinue = false;
        }

      } catch (error) {
        const toolDurationMs = Date.now() - toolStartTime;
        
        // Log tool error result
        await sessionObs.logToolResult(sessionId, toolCall.name, { error: error.message }, false, toolCall.id, toolDurationMs);
        
        await sessionObs.logError(sessionId, error, `tool_execution:${toolCall.name}`);

        actions.push({
          tool: toolCall.name,
          args: toolCall.arguments,
          error: error.message
        });
        
        // Emit status error if tool has a status message
        if (statusMessage?.start) {
          emit('status', { message: 'Something went wrong', tool: toolCall.name, phase: 'error' });
        }
        
        // Emit tool error for real-time streaming
        emit('tool_result', { tool: toolCall.name, error: error.message, success: false });
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      await sessionObs.logError(sessionId, `Max iterations (${MAX_ITERATIONS}) reached`, 'agent_loop');
    }

    // End session successfully
    await sessionObs.endSession(sessionId, 'completed');

    return {
      sessionId,
      actions,
      iterations: iteration
    };

  } catch (error) {
    // End session with error
    await sessionObs.endSession(sessionId, 'error', error.message);
    throw error;
  }
}

/**
 * Get the current state of a session
 * @param {string} sessionId - The session UUID
 * @returns {Object} Session state with recent actions
 */
async function getSessionState(sessionId) {
  const session = await sessionObs.getSession(sessionId);
  const events = await sessionObs.getContextEvents(sessionId, session.context_start_sequence);
  
  // Extract last messages/results for client
  const recentActions = events
    .filter(e => e.event_type === 'tool_call' || e.event_type === 'tool_result')
    .slice(-10);

  return {
    session,
    recentActions
  };
}

module.exports = {
  runAgentLoop,
  getSessionState,
  parseToolCallFromJson  // Export for testing
};
