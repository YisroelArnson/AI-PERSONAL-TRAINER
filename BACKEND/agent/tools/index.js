// BACKEND/agent/tools/index.js
// Tool Registry - combines all tools and provides execution interface
const { communicationTools } = require('./communication');
const { exerciseTools, getWorkoutSession } = require('./exercises');
const { dataTools } = require('./data');
const { locationTools } = require('./locations');

// Combine all tools into registry
const TOOL_REGISTRY = {
  ...communicationTools,
  ...exerciseTools,
  ...dataTools,
  ...locationTools
};

/**
 * Get tool definitions as a string for embedding in XML prompt
 * Returns a concise list suitable for the system prompt
 * @returns {string} Formatted tool descriptions
 */
function getToolDefinitions() {
  // For XML prompt approach, we don't need structured definitions
  // The tools are already listed in the system prompt
  // This function is kept for backwards compatibility
  return Object.entries(TOOL_REGISTRY).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

/**
 * Format result as XML
 * @param {string} content - The result content
 * @param {boolean} isError - Whether this is an error result
 * @returns {string} XML formatted result
 */
function formatResultXml(content, isError = false) {
  if (isError) {
    return `<result error="true">${content}</result>`;
  }
  return `<result>${content}</result>`;
}

/**
 * Execute a tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments for the tool
 * @param {Object} context - Execution context (userId, sessionId)
 * @returns {Object} Result with result, XML-formatted string, and status messages
 */
async function executeTool(toolName, args, context) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const result = await tool.execute(args, context);
  const rawFormatted = tool.formatResult(result);

  // Wrap in XML tags for event stream format
  const formatted = formatResultXml(rawFormatted, !result.success);

  // Include status messages for UI updates
  const statusMessage = tool.statusMessage || null;

  return { result, formatted, rawFormatted, statusMessage };
}

/**
 * Get the status message for a tool
 * @param {string} toolName - Name of the tool
 * @returns {Object|null} Status message object with start/done, or null
 */
function getToolStatusMessage(toolName) {
  const tool = TOOL_REGISTRY[toolName];
  return tool?.statusMessage || null;
}

/**
 * Check if a tool exists
 * @param {string} toolName - Name of the tool
 * @returns {boolean} True if tool exists
 */
function hasTool(toolName) {
  return toolName in TOOL_REGISTRY;
}

module.exports = {
  TOOL_REGISTRY,
  getToolDefinitions,
  executeTool,
  hasTool,
  getWorkoutSession,
  getToolStatusMessage
};
