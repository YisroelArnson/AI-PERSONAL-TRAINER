/**
 * File overview:
 * Supports worker startup and job processing for queue observers.
 *
 * Main functions in this file:
 * - startQueueObservers: Starts Queue observers for this module.
 */

const { QueueEvents } = require('bullmq');

const { getRedisConnection } = require('../infra/redis/connection');
const { getQueue } = require('../infra/queue/agent.queue');
const { recordDeadLetterFromJob } = require('../runtime/services/dead-letter.service');
const { isTerminalJobFailure } = require('../runtime/services/job-failure.service');

/**
 * Starts Queue observers for this module.
 */
function startQueueObservers(queueNames) {
  const connection = getRedisConnection();

  if (!connection) {
    throw new Error('REDIS_URL is not configured');
  }

  return queueNames.map(queueName => {
    const queueEvents = new QueueEvents(queueName, {
      connection
    });

    queueEvents.on('completed', ({ jobId }) => {
      console.log(`QUEUE ${queueName} COMPLETED | job=${jobId}`);
    });

    queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`QUEUE ${queueName} STALLED | job=${jobId}`);
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      try {
        const queue = getQueue(queueName);
        const job = await queue.getJob(jobId);

        if (!job || !isTerminalJobFailure(job, failedReason)) {
          return;
        }

        const errorCode = String(failedReason || '').startsWith('[permanent] ')
          ? 'permanent_failure'
          : 'retry_exhausted';
        const errorClass = errorCode === 'permanent_failure' ? 'permanent' : 'transient';

        await recordDeadLetterFromJob({
          queueName,
          job,
          errorClass,
          errorCode,
          errorMessage: failedReason
        });
      } catch (error) {
        console.error(`Unable to persist dead-letter record for queue=${queueName} job=${jobId}:`, error);
      }
    });

    return queueEvents;
  });
}

module.exports = {
  startQueueObservers
};
