// BACKEND/agent/tools/communication.js
// Communication tools for agent-user interaction

const sessionObs = require('../../services/sessionObservability.service');

const communicationTools = {
  message_notify_user: {
    description: 'Send a message to the user without expecting a response. Optionally include an artifact_id to deliver a previously created artifact with the message.',
    // No status message - this IS the message to the user
    statusMessage: null,
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to display to the user'
        },
        artifact_id: {
          type: 'string',
          description: 'Optional: ID of an artifact to deliver with this message (e.g., from generate_workout)'
        }
      },
      required: ['message']
    },
    execute: async (args, context) => {
      const result = {
        success: true,
        message: args.message,
        type: 'notification'
      };

      // If artifact_id provided, resolve and include the artifact
      if (args.artifact_id) {
        const artifact = await sessionObs.getArtifact(context.sessionId, args.artifact_id);
        if (artifact) {
          result.artifact = artifact;
          result.artifact_id = args.artifact_id;
        } else {
          // Artifact not found - still succeed but note it
          result.artifact_warning = `Artifact ${args.artifact_id} not found`;
        }
      }

      return result;
    },
    formatResult: (result) => {
      let formatted = `Notified user: "${result.message.substring(0, 50)}${result.message.length > 50 ? '...' : ''}"`;
      if (result.artifact_id) {
        formatted += ` [artifact: ${result.artifact_id}]`;
      }
      return formatted;
    }
  },

  message_ask_user: {
    description: 'Ask the user a question and wait for their response. Use when you need clarification or input.',
    // No status message - this IS the question to the user
    statusMessage: null,
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user'
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of suggested responses'
        }
      },
      required: ['question']
    },
    execute: async (args, context) => {
      return {
        success: true,
        question: args.question,
        options: args.options || [],
        type: 'question',
        awaiting_response: true
      };
    },
    formatResult: (result) => `Asked user: "${result.question.substring(0, 50)}${result.question.length > 50 ? '...' : ''}"`
  },

  idle: {
    description: 'Signal that you have completed the current task and are waiting for user input. Always call this when done.',
    statusMessage: {
      start: 'Wrapping up...',
      done: 'All done'
    },
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for going idle'
        }
      },
      required: ['reason']
    },
    execute: async (args, context) => {
      return {
        success: true,
        idle: true,
        reason: args.reason
      };
    },
    formatResult: (result) => `Agent idle: ${result.reason}`
  }
};

module.exports = { communicationTools };
