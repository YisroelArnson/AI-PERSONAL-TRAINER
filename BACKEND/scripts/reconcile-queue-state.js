/**
 * File overview:
 * Provides a maintenance script for reconcile queue state.
 *
 * Main functions in this file:
 * - main: Handles Main for reconcile-queue-state.js.
 */

const { reconcileQueueState } = require('../src/runtime/services/queue-recovery.service');

/**
 * Handles Main for reconcile-queue-state.js.
 */
async function main() {
  const limitArg = process.argv.slice(2).find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
  const summary = await reconcileQueueState(Number.isFinite(limit) ? limit : 100);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error('Queue reconciliation failed:', error);
  process.exitCode = 1;
});
