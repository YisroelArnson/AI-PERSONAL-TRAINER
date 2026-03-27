const memorySearchTool = require('./handlers/memory-search.tool');
const documentReplaceTextTool = require('./handlers/document-replace-text.tool');
const documentReplaceEntireTool = require('./handlers/document-replace-entire.tool');
const episodicNoteAppendTool = require('./handlers/episodic-note-append.tool');
const workoutHistoryFetchTool = require('./handlers/workout-history-fetch.tool');
const workoutGenerateTool = require('./handlers/workout-generate.tool');
const workoutRecordSetResultTool = require('./handlers/workout-record-set-result.tool');
const workoutSessionControlTool = require('./handlers/workout-session-control.tool');
const workoutSkipExerciseTool = require('./handlers/workout-skip-exercise.tool');
const workoutRewriteRemainingTool = require('./handlers/workout-rewrite-remaining.tool');
const workoutReplaceExerciseTool = require('./handlers/workout-replace-exercise.tool');
const workoutAdjustSetTargetsTool = require('./handlers/workout-adjust-set-targets.tool');
const workoutFinishSessionTool = require('./handlers/workout-finish-session.tool');
const { validateToolInput, buildToolValidationError } = require('./tool-input-validation');

const REGISTERED_TOOLS = [
  memorySearchTool,
  workoutHistoryFetchTool,
  workoutGenerateTool,
  workoutSessionControlTool,
  workoutRewriteRemainingTool,
  workoutReplaceExerciseTool,
  workoutAdjustSetTargetsTool,
  workoutRecordSetResultTool,
  workoutSkipExerciseTool,
  workoutFinishSessionTool,
  documentReplaceTextTool,
  documentReplaceEntireTool,
  episodicNoteAppendTool
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

  const normalizedInput = input || {};
  const validationIssue = validateToolInput(tool.definition.inputSchema, normalizedInput);

  if (validationIssue) {
    return {
      toolName,
      mutating: tool.definition.mutating,
      ...buildToolValidationError(tool.definition, validationIssue)
    };
  }

  const result = await tool.execute({
    input: normalizedInput,
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
