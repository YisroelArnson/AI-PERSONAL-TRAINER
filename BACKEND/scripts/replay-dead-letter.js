/**
 * File overview:
 * Provides a maintenance script for replay dead letter.
 *
 * Main functions in this file:
 * - main: Handles Main for replay-dead-letter.js.
 */

const {
  replayDeadLetterById,
  replayOpenDeadLetters
} = require('../src/runtime/services/queue-recovery.service');

/**
 * Handles Main for replay-dead-letter.js.
 */
async function main() {
  const args = process.argv.slice(2);
  const idArg = args.find(arg => arg.startsWith('--id='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));

  if (idArg) {
    const replayed = await replayDeadLetterById(idArg.split('=')[1]);
    console.log(JSON.stringify(replayed, null, 2));
    return;
  }

  const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
  const replayed = await replayOpenDeadLetters(Number.isFinite(limit) ? limit : 100);
  console.log(JSON.stringify(replayed, null, 2));
}

main().catch(error => {
  console.error('Dead-letter replay failed:', error);
  process.exitCode = 1;
});
