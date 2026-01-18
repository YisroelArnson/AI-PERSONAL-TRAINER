// BACKEND/controllers/agent.controller.js
// HTTP handlers for agent endpoints
const { runAgentLoop, getSessionState } = require('../services/agentLoop.service');
const { getUserSessions, getSession, createSession } = require('../services/sessionObservability.service');

/**
 * Handle chat request (non-streaming)
 */
async function handleChat(req, res) {
  try {
    const { message, sessionId, currentWorkout } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await runAgentLoop(userId, message, { sessionId, currentWorkout });

    // Extract response for client
    const response = formatResponseForClient(result.actions);

    res.json({
      sessionId: result.sessionId,
      response,
      iterations: result.iterations
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handle streaming chat request
 * Now streams events in real-time as the agent executes tools
 */
async function handleStreamChat(req, res) {
  try {
    const { message, sessionId, currentWorkout } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Handle client disconnect
    let isClientConnected = true;
    req.on('close', () => {
      isClientConnected = false;
    });
    
    // Real-time event callback - sends events as they happen
    const onEvent = (event) => {
      if (!isClientConnected) return;
      
      try {
        if (event.type === 'status') {
          // Status update for the flickering text UI
          // Shows progress like "Gathering your info..." → "Context ready ✓"
          const sseEvent = {
            type: 'status',
            data: {
              message: event.message,
              tool: event.tool,
              phase: event.phase  // 'start', 'done', or 'error'
            }
          };
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }
        else if (event.type === 'tool_start') {
          // Notify client that a tool is starting (for detailed logging)
          const sseEvent = {
            type: event.tool,
            data: { status: 'running', args: event.args }
          };
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        } 
        else if (event.type === 'tool_result') {
          // Send the tool result immediately
          // This is where message_notify_user gets streamed in real-time!
          const sseEvent = {
            type: event.tool,
            data: event.result || { error: event.error },
            formatted: event.formatted,  // Include formatted result for display
            status: event.success ? 'done' : 'failed'
          };
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }
        else if (event.type === 'knowledge') {
          // Knowledge/context event from initializer agent
          // Shows what data sources are being loaded
          const sseEvent = {
            type: 'knowledge',
            data: {
              source: event.source,
              displayName: event.displayName,
              status: 'done'
            }
          };
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }
      } catch (e) {
        console.error('Error writing SSE event:', e);
      }
    };

    // Run the agent loop with real-time streaming callback
    const result = await runAgentLoop(userId, message, { 
      sessionId,
      currentWorkout,
      onEvent  // This callback streams events as they happen!
    });

    // Send completion event
    if (isClientConnected) {
      res.write(`data: ${JSON.stringify({ type: 'done', sessionId: result.sessionId })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
}

/**
 * Get user's sessions
 */
async function getSessions(req, res) {
  try {
    const userId = req.user.id;
    const { limit } = req.query;

    const sessions = await getUserSessions(userId, parseInt(limit) || 10);
    res.json({ sessions });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get specific session details
 */
async function getSessionById(req, res) {
  try {
    const { id } = req.params;
    const state = await getSessionState(id);
    res.json(state);

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create new session
 */
async function startNewSession(req, res) {
  try {
    const userId = req.user.id;
    const session = await createSession(userId);
    res.json({ session });

  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Format actions into client response
 * @param {Array} actions - Array of executed actions
 * @returns {Object} Client-friendly response
 */
function formatResponseForClient(actions) {
  const response = {
    messages: [],
    exercises: null,
    question: null
  };

  for (const action of actions) {
    if (action.tool === 'message_notify_user' && action.result?.message) {
      response.messages.push(action.result.message);
    }
    
    if (action.tool === 'message_ask_user' && action.result?.question) {
      response.question = {
        text: action.result.question,
        options: action.result.options
      };
    }
    
    if (action.tool === 'generate_workout' && action.result?.exercises) {
      response.exercises = action.result.exercises;
    }
  }

  return response;
}

module.exports = {
  handleChat,
  handleStreamChat,
  getSessions,
  getSessionById,
  startNewSession
};
