/**
 * File overview:
 * Implements the trainer tool handler for message notify user.
 *
 * Main functions in this file:
 * - normalizeText: Normalizes Text into the format this file expects.
 * - resolveDelivery: Resolves Delivery before the next step runs.
 * - execute: Executes the main action flow.
 * - isTerminalCall: Handles Is terminal call for message-notify-user.tool.js.
 */

const { appendAssistantEvent } = require('../../services/transcript-write.service');

const definition = {
  name: 'message_notify_user',
  category: 'user communication',
  mutating: true,
  description: 'Send a user-facing message. Use delivery="transient" for in-run progress only, or omit delivery to write a durable assistant feed message and end the run.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        minLength: 1,
        maxLength: 4000
      },
      delivery: {
        type: 'string',
        enum: ['transient', 'feed']
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

/**
 * Resolves Delivery before the next step runs.
 */
function resolveDelivery(input) {
  return String(input && input.delivery || 'feed').trim().toLowerCase() === 'transient'
    ? 'transient'
    : 'feed';
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
  const delivery = resolveDelivery(input);

  if (!text) {
    return {
      status: 'validation_error',
      error: {
        code: 'EMPTY_TEXT',
        explanation: 'text must be a non-empty string.',
        agent_guidance: 'Provide the exact user-facing message text.',
        retryable_in_run: true
      }
    };
  }

  if (delivery === 'feed') {
    if (isBackgroundRun(run)) {
      return {
        status: 'ok',
        output: {
          kind: 'notify',
          text,
          delivery: 'suppressed',
          skipped: true,
          skipReason: 'background_run'
        }
      };
    }

    const appendResult = await appendAssistantEvent({
      run,
      eventType: 'assistant.notify',
      text,
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'notify',
        delivery
      }
    });

    if (appendResult && appendResult.skipped) {
      return {
        status: 'ok',
        output: {
          kind: 'notify',
          text,
          delivery: 'suppressed',
          skipped: true,
          skipReason: appendResult.reason || 'stale_user_turn'
        }
      };
    }
  }

  return {
    status: 'ok',
    output: {
      kind: 'notify',
      text,
      delivery
    }
  };
}

/**
 * Handles Is terminal call for message-notify-user.tool.js.
 */
function isTerminalCall(input) {
  return resolveDelivery(input) === 'feed';
}

module.exports = {
  definition,
  execute,
  isTerminalCall
};
