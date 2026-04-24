/**
 * File overview:
 * Implements the trainer tool handler for message ask user.
 *
 * Main functions in this file:
 * - normalizeText: Normalizes Text into the format this file expects.
 * - execute: Executes the main action flow.
 * - isTerminalCall: Handles Is terminal call for message-ask-user.tool.js.
 */

const { appendAssistantEvent } = require('../../services/transcript-write.service');

const definition = {
  name: 'message_ask_user',
  category: 'user communication',
  mutating: true,
  description: 'Ask the user a question, write it durably to the feed, and end the run.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        minLength: 1,
        maxLength: 4000
      }
    },
    required: ['text'],
    additionalProperties: false
  }
};

/**
 * Normalizes Text into the format this file expects.
 */
function normalizeText(value) {
  return String(value || '').trim();
}

function isBackgroundRun(run) {
  const triggerPayload = run && typeof run.trigger_payload === 'object' ? run.trigger_payload : {};
  const metadata = triggerPayload && typeof triggerPayload.metadata === 'object'
    ? triggerPayload.metadata
    : {};

  if (metadata.runVisibility === 'foreground') {
    return false;
  }

  return metadata.runVisibility === 'background' || (run && run.trigger_type === 'app.opened');
}

/**
 * Executes the main action flow.
 */
async function execute({ input, run }) {
  const text = normalizeText(input && input.text);

  if (!text) {
    return {
      status: 'validation_error',
      error: {
        code: 'EMPTY_TEXT',
        explanation: 'text must be a non-empty string.',
        agent_guidance: 'Provide the exact question to send to the user.',
        retryable_in_run: true
      }
    };
  }

  if (isBackgroundRun(run)) {
    return {
      status: 'ok',
      output: {
        kind: 'ask',
        text,
        delivery: 'suppressed',
        skipped: true,
        skipReason: 'background_run'
      }
    };
  }

  const appendResult = await appendAssistantEvent({
    run,
    eventType: 'assistant.ask',
    text,
    requireLatestUserTurn: true,
    extraPayload: {
      kind: 'ask',
      delivery: 'feed'
    }
  });

  if (appendResult && appendResult.skipped) {
    return {
      status: 'ok',
      output: {
        kind: 'ask',
        text,
        delivery: 'suppressed',
        skipped: true,
        skipReason: appendResult.reason || 'stale_user_turn'
      }
    };
  }

  return {
    status: 'ok',
    output: {
      kind: 'ask',
      text,
      delivery: 'feed'
    }
  };
}

/**
 * Handles Is terminal call for message-ask-user.tool.js.
 */
function isTerminalCall() {
  return true;
}

module.exports = {
  definition,
  execute,
  isTerminalCall
};
