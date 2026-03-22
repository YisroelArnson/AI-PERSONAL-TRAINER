const coachSoulGetTool = require('./handlers/coach-soul-get.tool');
const coachSoulReplaceEntireTool = require('./handlers/coach-soul-replace-entire.tool');
const memoryGetTool = require('./handlers/memory-get.tool');
const memorySearchTool = require('./handlers/memory-search.tool');
const programGetTool = require('./handlers/program-get.tool');
const documentReplaceTextTool = require('./handlers/document-replace-text.tool');
const documentReplaceEntireTool = require('./handlers/document-replace-entire.tool');
const episodicNoteAppendTool = require('./handlers/episodic-note-append.tool');

const REGISTERED_TOOLS = [
  memoryGetTool,
  memorySearchTool,
  coachSoulGetTool,
  programGetTool,
  documentReplaceTextTool,
  documentReplaceEntireTool,
  episodicNoteAppendTool,
  coachSoulReplaceEntireTool
];

const TOOL_HANDLERS = Object.fromEntries(
  REGISTERED_TOOLS.map(tool => [tool.definition.name, tool])
);

function listToolDefinitions() {
  return REGISTERED_TOOLS.map(entry => entry.definition);
}

function getToolDefinition(toolName) {
  const tool = TOOL_HANDLERS[toolName];

  if (!tool) {
    throw new Error(`Unknown tool requested: ${toolName}`);
  }

  return tool.definition;
}

async function executeToolCall({ toolName, input, run }) {
  const tool = TOOL_HANDLERS[toolName];

  if (!tool) {
    return {
      status: 'semantic_error',
      error: {
        code: 'UNKNOWN_TOOL',
        explanation: `The tool ${toolName} is not registered.`,
        agent_guidance: 'Choose one of the canonical registered tools instead of inventing a tool name.',
        suggested_fix: {
          available_tools: listToolDefinitions().map(definition => definition.name)
        },
        retryable_in_run: true
      }
    };
  }

  const result = await tool.execute({
    input: input || {},
    userId: run.user_id,
    run,
    toolDefinition: tool.definition
  });

  if (
    result &&
    typeof result === 'object' &&
    typeof result.status === 'string' &&
    (result.status === 'ok' || result.status === 'semantic_error' || result.status === 'validation_error')
  ) {
    return {
      toolName,
      mutating: tool.definition.mutating,
      ...result
    };
  }

  return {
    status: 'ok',
    toolName,
    mutating: tool.definition.mutating,
    output: result
  };
}

module.exports = {
  listToolDefinitions,
  getToolDefinition,
  executeToolCall
};
