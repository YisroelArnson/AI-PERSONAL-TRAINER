const { processUserRequest } = require('../services/orchestrationAgent.service');

/**
 * Process user message through the orchestration agent
 * POST /agent/chat
 */
async function chat(req, res) {
  try {
    const { message, userId } = req.body;

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string'
      });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required and must be a string'
      });
    }

    console.log(`Chat request from user ${userId}: "${message}"`);

    // Process the user request through the agent
    const result = await processUserRequest(message, userId);

    res.status(200).json({
      ...result,
      timestamp: new Date().toISOString(),
      userId
    });

  } catch (error) {
    console.error('Error in chat controller:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Process user message through the orchestration agent with streaming support
 * POST /agent/stream
 */
async function streamChat(req, res) {
  try {
    const { message, userId } = req.body;

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string'
      });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required and must be a string'
      });
    }

    console.log(`Streaming chat request from user ${userId}: "${message}"`);

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial response
    res.write(JSON.stringify({
      type: 'start',
      success: true,
      userId,
      timestamp: new Date().toISOString()
    }) + '\n');

    let exerciseCount = 0;
    let textResponse = '';
    
    // Process the user request with streaming enabled
    console.log(`Processing streaming request for user ${userId}: "${message}"`);
    const result = await processUserRequest(message, userId, {
      enableStreaming: true,
      onExercise: (exercise) => {
        exerciseCount++;
        // Stream each exercise as it's generated
        res.write(JSON.stringify({
          type: 'exercise',
          data: exercise,
          index: exerciseCount - 1
        }) + '\n');
        
        console.log(`Streamed exercise ${exerciseCount} for user: ${userId}`);
      },
      onTextDelta: (textDelta) => {
        textResponse += textDelta;
        // Stream each text chunk as it's generated
        res.write(JSON.stringify({
          type: 'text',
          data: textDelta
        }) + '\n');
        
        console.log(`Streamed text chunk: "${textDelta}" for user: ${userId}`);
      }
    });
    console.log(`Streaming request completed for user ${userId}. Result:`, result);

    // Send the final agent response (this might be empty if everything was streamed)
    res.write(JSON.stringify({
      type: 'response',
      data: {
        response: result.response,
        success: result.success,
        fullTextResponse: textResponse || result.response
      }
    }) + '\n');

    // Send completion message
    res.write(JSON.stringify({
      type: 'complete',
      exerciseCount,
      timestamp: new Date().toISOString()
    }) + '\n');

    res.end();

  } catch (error) {
    console.error('Error in streamChat controller:', error);
    
    // Send error through stream if possible
    try {
      res.write(JSON.stringify({
        type: 'error',
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your request',
        timestamp: new Date().toISOString()
      }) + '\n');
      res.end();
    } catch (streamError) {
      // If we can't stream the error, send regular JSON response
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your request',
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = { chat, streamChat };