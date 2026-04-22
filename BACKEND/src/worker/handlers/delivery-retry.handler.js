/**
 * File overview:
 * Handles queued worker jobs for delivery retry.
 *
 * Main functions in this file:
 * - handleDeliveryRetry: Handles Delivery retry for this module.
 */

const { handleDeliverySend } = require('./delivery-send.handler');

/**
 * Handles Delivery retry for this module.
 */
async function handleDeliveryRetry(job) {
  return handleDeliverySend(job);
}

module.exports = {
  handleDeliveryRetry
};
