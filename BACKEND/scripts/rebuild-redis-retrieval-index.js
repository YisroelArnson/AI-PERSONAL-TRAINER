#!/usr/bin/env node
/**
 * File overview:
 * Provides a maintenance script for rebuild redis retrieval index.
 *
 * Main functions in this file:
 * - main: Handles Main for rebuild-redis-retrieval-index.js.
 */

/**
 * File overview:
 * Provides a maintenance script for rebuild redis retrieval index.
 *
 * Main functions in this file:
 * - main: Handles main for rebuild-redis-retrieval-index.js.
 */


const { getRedisConnection } = require('../src/infra/redis/connection');
const { rebuildRedisRetrievalIndex } = require('../src/runtime/services/redis-retrieval-index.service');

/**
 * Handles Main for rebuild-redis-retrieval-index.js.
 */
async function main() {
  const rawArg = process.argv[2] || null;

  if (rawArg === '--help' || rawArg === '-h') {
    console.log('Usage: node scripts/rebuild-redis-retrieval-index.js [userId]');
    return;
  }

  const userId = rawArg || null;
  const result = await rebuildRedisRetrievalIndex({
    userId
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const redis = getRedisConnection();

    if (redis) {
      await redis.quit().catch(() => null);
    }
  });
