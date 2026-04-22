/**
 * File overview:
 * Handles queued worker jobs for delivery send.
 *
 * Main functions in this file:
 * - handleDeliverySend: Handles Delivery send for this module.
 */

const { enqueueDeliveryRetry } = require('../../infra/queue/agent.queue');
const { computeRetryDelayMs, resolveQueueRetrySettings } = require('../../infra/queue/queue.config');
const {
  beginDeliveryAttempt,
  getDeliveryRecordById,
  markDeliveryDelivered,
  markDeliveryFailed,
  markDeliveryPendingRetry
} = require('../../runtime/services/delivery-outbox.service');
const { PermanentJobError } = require('../../runtime/services/job-failure.service');

/**
 * Handles Delivery send for this module.
 */
async function handleDeliverySend(job) {
  const {
    deliveryId,
    runId,
    userId
  } = job.data;
  const existingRecord = await getDeliveryRecordById(deliveryId);

  if (!existingRecord) {
    return {
      status: 'skipped',
      reason: 'missing_delivery',
      deliveryId
    };
  }

  if (['delivered', 'canceled'].includes(existingRecord.status)) {
    return {
      status: 'noop',
      deliveryId,
      deliveryStatus: existingRecord.status
    };
  }

  const deliveryRecord = await beginDeliveryAttempt(deliveryId);

  if (!deliveryRecord) {
    return {
      status: 'skipped',
      reason: 'missing_delivery',
      deliveryId
    };
  }

  try {
    await markDeliveryDelivered(deliveryId);

    return {
      status: 'delivered',
      deliveryId,
      runId
    };
  } catch (error) {
    const retrySettings = resolveQueueRetrySettings();
    const currentAttempt = Number(deliveryRecord.attempt_count || 0);

    if (currentAttempt < retrySettings.maxAttempts) {
      const delayMs = computeRetryDelayMs(currentAttempt + 1, retrySettings.baseDelayMs);
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

      await markDeliveryPendingRetry(deliveryId, nextAttemptAt);
      await enqueueDeliveryRetry({
        deliveryId,
        runId,
        userId,
        attemptCount: currentAttempt + 1,
        delayMs
      });

      return {
        status: 'retry_scheduled',
        deliveryId,
        nextAttemptAt,
        nextAttemptCount: currentAttempt + 1
      };
    }

    await markDeliveryFailed(deliveryId);

    throw new PermanentJobError('Delivery permanently failed', {
      code: 'DELIVERY_FAILED'
    });
  }
}

module.exports = {
  handleDeliverySend
};
