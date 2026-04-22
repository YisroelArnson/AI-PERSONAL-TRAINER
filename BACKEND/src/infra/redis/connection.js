/**
 * File overview:
 * Provides infrastructure helpers for connection.
 *
 * Main functions in this file:
 * - getRedisConnection: Gets Redis connection needed by this file.
 */

const IORedis = require('ioredis');

const { env } = require('../../config/env');

let redisConnection;

/**
 * Gets Redis connection needed by this file.
 */
function getRedisConnection() {
  if (!env.redisUrl) {
    return null;
  }

  if (!redisConnection) {
    redisConnection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null
    });
  }

  return redisConnection;
}

module.exports = {
  getRedisConnection
};
