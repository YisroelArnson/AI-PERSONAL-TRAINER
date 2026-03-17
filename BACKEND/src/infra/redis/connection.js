const IORedis = require('ioredis');

const { env } = require('../../config/env');

let redisConnection;

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
