const { appendStreamEvent } = require('../../runtime/services/stream-events.service');
const {
  getRunById,
  markRunFailed,
  markRunRunning,
  markRunSucceeded
} = require('../../runtime/services/run-state.service');

async function handleAgentRunTurn(job) {
  const { runId } = job.data;

  try {
    const run = await getRunById(runId);

    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'canceled') {
      return {
        runId,
        status: run.status,
        skipped: true
      };
    }

    await markRunRunning(runId);
    await appendStreamEvent({
      runId,
      eventType: 'run.started',
      payload: {
        phase: 'worker',
        jobId: job.id
      }
    });

    await appendStreamEvent({
      runId,
      eventType: 'run.output',
      payload: {
        message: 'Stub worker completed the run lifecycle.'
      }
    });

    await appendStreamEvent({
      runId,
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: job.id
      }
    });

    await markRunSucceeded(runId);

    return {
      runId,
      status: 'succeeded'
    };
  } catch (error) {
    try {
      await markRunFailed(runId, error);
    } catch (markFailedError) {
      console.error(`Unable to mark run ${runId} as failed:`, markFailedError);
    }

    throw error;
  }
}

module.exports = {
  handleAgentRunTurn
};
