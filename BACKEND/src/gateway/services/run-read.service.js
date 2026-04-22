/**
 * File overview:
 * Implements the run read service logic that powers gateway requests.
 *
 * Main functions in this file:
 * - loadOwnedRun: Loads Owned run for the surrounding workflow.
 * - buildRunStatusView: Builds a Run status view used by this file.
 * - buildRunResultView: Builds a Run result view used by this file.
 */

const { notFound } = require('../../shared/errors');
const { getLatestDeliveryRecordForRun } = require('../../runtime/services/delivery-outbox.service');
const { getStreamEventBounds } = require('../../runtime/services/stream-events.service');
const { getRunById } = require('../../runtime/services/run-state.service');

/**
 * Loads Owned run for the surrounding workflow.
 */
async function loadOwnedRun(runId, userId) {
  const run = await getRunById(runId).catch(error => {
    if (error && error.code === 'PGRST116') {
      return null;
    }

    throw error;
  });

  if (!run || run.user_id !== userId) {
    throw notFound('Run not found');
  }

  return run;
}

/**
 * Builds a Run status view used by this file.
 */
async function buildRunStatusView({ runId, userId }) {
  const [run, delivery, streamBounds] = await Promise.all([
    loadOwnedRun(runId, userId),
    getLatestDeliveryRecordForRun(runId).catch(() => null),
    getStreamEventBounds(runId).catch(() => ({
      firstSeqNum: null,
      lastSeqNum: null
    }))
  ]);

  return {
    runId: run.run_id,
    status: run.status,
    triggerType: run.trigger_type,
    sessionKey: run.session_key,
    sessionId: run.session_id,
    createdAt: run.created_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    provider: run.provider_key || null,
    model: run.model_key || null,
    error: run.error_code || run.error_message
      ? {
          code: run.error_code || null,
          message: run.error_message || null
        }
      : null,
    stream: {
      url: `/v1/runs/${run.run_id}/stream`,
      resultUrl: `/v1/runs/${run.run_id}/result`,
      firstSeqNum: streamBounds.firstSeqNum,
      lastSeqNum: streamBounds.lastSeqNum
    },
    delivery: delivery
      ? {
          deliveryId: delivery.delivery_id,
          status: delivery.status,
          deliveredAt: delivery.delivered_at,
          resultUrl: `/v1/runs/${run.run_id}/result`
        }
      : null
  };
}

/**
 * Builds a Run result view used by this file.
 */
async function buildRunResultView({ runId, userId }) {
  const run = await loadOwnedRun(runId, userId);
  const delivery = await getLatestDeliveryRecordForRun(runId);

  if (!delivery || ['pending', 'processing'].includes(delivery.status)) {
    return {
      httpStatus: 202,
      body: {
        runId: run.run_id,
        status: run.status,
        deliveryStatus: delivery ? delivery.status : 'pending',
        ready: false
      }
    };
  }

  if (delivery.status === 'failed') {
    return {
      httpStatus: 200,
      body: {
        runId: run.run_id,
        status: run.status,
        deliveryStatus: delivery.status,
        ready: true,
        payload: delivery.payload || {}
      }
    };
  }

  return {
    httpStatus: 200,
    body: {
      runId: run.run_id,
      status: run.status,
      deliveryStatus: delivery.status,
      ready: true,
      payload: delivery.payload || {}
    }
  };
}

module.exports = {
  buildRunResultView,
  buildRunStatusView
};
