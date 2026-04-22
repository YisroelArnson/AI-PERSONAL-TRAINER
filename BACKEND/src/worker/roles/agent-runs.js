/**
 * File overview:
 * Defines the worker role configuration for agent runs.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { startWorkerRole } = require('../runtime');
const { QUEUE_NAMES } = require('../../infra/queue/queue.constants');
const { startQueueObservers } = require('../queue-observers');

if (require.main === module) {
  startQueueObservers([QUEUE_NAMES.agentRuns]);
  startWorkerRole('agentRuns');
}

module.exports = {
  startAgentRunsWorker: () => startWorkerRole('agentRuns')
};
