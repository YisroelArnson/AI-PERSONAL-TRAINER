/**
 * File overview:
 * Supports worker startup and job processing for index.
 *
 * Main functions in this file:
 * - startWorkerCluster: Starts Worker cluster for this module.
 */

const { startWorkers } = require('./runtime');

/**
 * Starts Worker cluster for this module.
 */
function startWorkerCluster() {
  return startWorkers();
}

if (require.main === module) {
  startWorkerCluster();
}

module.exports = {
  startWorker: startWorkerCluster,
  startWorkerCluster
};
