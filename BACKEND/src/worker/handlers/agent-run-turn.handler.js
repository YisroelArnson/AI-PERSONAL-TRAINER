const { env } = require('../../config/env');
const { appendStreamEvent } = require('../../runtime/services/stream-events.service');
const { runAgentTurn } = require('../../runtime/agent-runtime/run-agent-turn');
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

    await markRunRunning(runId, {
      providerKey: env.defaultLlmProvider,
      modelKey: env.defaultAnthropicModel
    });

    await appendStreamEvent({
      runId,
      eventType: 'run.started',
      payload: {
        phase: 'worker',
        jobId: job.id
      }
    });

    const result = await runAgentTurn(run);

    await appendStreamEvent({
      runId,
      eventType: 'run.completed',
      payload: {
        phase: 'worker',
        jobId: job.id,
        provider: result.provider,
        model: result.model
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
