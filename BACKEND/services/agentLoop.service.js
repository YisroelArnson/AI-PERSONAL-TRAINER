// BACKEND/services/agentLoop.service.js
// Main agent loop - Anthropic-only with proper multi-cache-block approach
const dotenv = require('dotenv');
const { buildAgentContext, estimateTokens } = require('./contextBuilder.service');
const { initializeContext } = require('./initializerAgent.service');
const { executeTool, getToolStatusMessage, getToolDefinitions } = require('../agent/tools');
const sessionObs = require('./sessionObservability.service');
const { formatCurrentWorkout } = require('./dataFormatters.service');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const MAX_ITERATIONS = 10;

// Default model from environment
const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

/**
 * Convert tool registry format to Anthropic's native tool use format
 * Adds cache_control to the last tool to enable prompt caching for all tools
 * @returns {Array} Tools in Anthropic API format with caching enabled
 */
function getAnthropicTools() {
  const toolDefs = getToolDefinitions();
  return toolDefs.map((tool, index) => {
    const anthropicTool = {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters  // Anthropic uses input_schema, not parameters
    };

    // Add cache_control to the LAST tool to cache all tools as a prefix
    // This gives us 90% cost reduction on tool definitions after first request
    if (index === toolDefs.length - 1) {
      anthropicTool.cache_control = { type: 'ephemeral' };
    }

    return anthropicTool;
  });
}

/**
 * Call Anthropic API with native tool use and proper multi-cache-block approach
 *
 * Cache breakpoints (4 total):
 * 1. Tools - cache_control on last tool
 * 2. System prompt - cache_control on system text block
 * 3. User data - cache_control on separate system text block
 * 4. Messages - cache_control on last content block of last message (set by contextBuilder)
 *
 * @param {Object} client - Anthropic client instance
 * @param {string} modelId - Model ID (e.g., 'claude-haiku-4-5')
 * @param {Object} context - Context from buildAgentContext
 * @returns {Object} Normalized response with toolCall and usage
 */
async function callAnthropicModel(client, modelId, context) {
  const tools = getAnthropicTools();

  // Debug: Log message count
  console.log(`[ANTHROPIC] Calling ${modelId} with ${context.messages.length} messages`);

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 8192,
    tools: tools,
    tool_choice: { type: 'any' },  // Force tool use (agent must call a tool)
    system: [
      {
        type: 'text',
        text: context.systemPrompt,
        cache_control: { type: 'ephemeral' }  // Cache breakpoint 2: system prompt
      },
      {
        type: 'text',
        text: context.userDataXml,
        cache_control: { type: 'ephemeral' }  // Cache breakpoint 3: user data
      }
    ],
    messages: context.messages  // Cache breakpoint 4 already set by contextBuilder
  });

  // Find the tool_use block in the response
  const toolUseBlock = response.content.find(block => block.type === 'tool_use');

  return {
    toolCall: toolUseBlock ? {
      id: toolUseBlock.id,
      name: toolUseBlock.name,
      arguments: toolUseBlock.input
    } : null,
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      cacheCreationTokens: response.usage?.cache_creation_input_tokens || 0,
      cacheReadTokens: response.usage?.cache_read_input_tokens || 0
    },
    model: response.model,
    stopReason: response.stop_reason,
    // Include raw response for observability logging
    _rawResponse: {
      usage: response.usage,
      model: response.model,
      stop_reason: response.stop_reason,
      _provider: 'anthropic'
    }
  };
}

/**
 * Main agent loop
 * Processes user input, manages context, and executes tools
 * @param {string} userId - The user's UUID
 * @param {string} userInput - The user's message
 * @param {Object} options - Optional parameters
 * @param {string} options.sessionId - Existing session ID to continue
 * @param {Function} options.onEvent - Callback for real-time event streaming
 * @param {Object} options.currentWorkout - Current workout session state from client
 * @param {string} options.model - Model to use (defaults to PRIMARY_MODEL env var)
 * @returns {Object} Result with sessionId, actions, and iterations
 */
async function runAgentLoop(userId, userInput, options = {}) {
  const { sessionId: existingSessionId, onEvent, currentWorkout, model } = options;

  // Determine which model to use (API param > env var > default)
  const activeModel = model || DEFAULT_MODEL;

  // Get Anthropic client
  const client = getAnthropicClient();

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

      // Build context (fetches events, user data, formats messages)
      const context = await buildAgentContext(sessionId, userId);

      // Check token estimate
      const tokenEstimate = estimateTokens(context);

      // Log LLM request
      await sessionObs.logLLMRequest(sessionId, activeModel, `[Native multi-turn: ${context.eventCount} events]`, tokenEstimate);

      // Call LLM
      const startTime = Date.now();

      try {
        const response = await callAnthropicModel(client, activeModel, context);
        const durationMs = Date.now() - startTime;
        totalDurationMs += durationMs;

        const toolCall = response.toolCall;

        // Log cache performance
        const cacheHitPct = response.usage.inputTokens > 0
          ? ((response.usage.cacheReadTokens / response.usage.inputTokens) * 100).toFixed(1)
          : 0;
        console.log(`[CACHE] Read: ${response.usage.cacheReadTokens}, Write: ${response.usage.cacheCreationTokens}, Hit: ${cacheHitPct}%`);

        // Log LLM response
        await sessionObs.logLLMResponse(sessionId, {
          rawResponse: response._rawResponse,
          durationMs
        });

        if (!toolCall) {
          await sessionObs.logError(sessionId, 'No tool call in response', 'parse_response');
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

          // Log tool result
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

      } catch (error) {
        await sessionObs.logError(sessionId, error, 'llm_call');
        throw error;
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
  getSessionState
};
