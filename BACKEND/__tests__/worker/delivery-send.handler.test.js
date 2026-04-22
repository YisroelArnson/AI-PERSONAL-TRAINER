/**
 * File overview:
 * Contains automated tests for the delivery send handler behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const mockEnqueueDeliveryRetry = jest.fn();
const mockComputeRetryDelayMs = jest.fn();
const mockResolveQueueRetrySettings = jest.fn();
const mockBeginDeliveryAttempt = jest.fn();
const mockGetDeliveryRecordById = jest.fn();
const mockMarkDeliveryDelivered = jest.fn();
const mockMarkDeliveryFailed = jest.fn();
const mockMarkDeliveryPendingRetry = jest.fn();

jest.mock('../../src/infra/queue/agent.queue', () => ({
  enqueueDeliveryRetry: mockEnqueueDeliveryRetry
}));

jest.mock('../../src/infra/queue/queue.config', () => ({
  computeRetryDelayMs: mockComputeRetryDelayMs,
  resolveQueueRetrySettings: mockResolveQueueRetrySettings
}));

jest.mock('../../src/runtime/services/delivery-outbox.service', () => ({
  beginDeliveryAttempt: mockBeginDeliveryAttempt,
  getDeliveryRecordById: mockGetDeliveryRecordById,
  markDeliveryDelivered: mockMarkDeliveryDelivered,
  markDeliveryFailed: mockMarkDeliveryFailed,
  markDeliveryPendingRetry: mockMarkDeliveryPendingRetry
}));

const { PermanentJobError } = require('../../src/runtime/services/job-failure.service');
const { handleDeliverySend } = require('../../src/worker/handlers/delivery-send.handler');

describe('delivery-send.handler', () => {
  const job = {
    data: {
      deliveryId: 'delivery-123',
      runId: 'run-123',
      userId: 'user-123'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveQueueRetrySettings.mockReturnValue({
      maxAttempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 300000
    });
    mockGetDeliveryRecordById.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'pending'
    });
    mockBeginDeliveryAttempt.mockResolvedValue({
      delivery_id: 'delivery-123',
      attempt_count: 1
    });
    mockMarkDeliveryDelivered.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'delivered'
    });
    mockMarkDeliveryPendingRetry.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'pending'
    });
    mockMarkDeliveryFailed.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'failed'
    });
    mockComputeRetryDelayMs.mockReturnValue(5000);
    mockEnqueueDeliveryRetry.mockResolvedValue({
      jobId: 'delivery.retry:delivery-123:attempt2'
    });
  });

  it('marks the outbox row delivered on success', async () => {
    const result = await handleDeliverySend(job);

    expect(mockBeginDeliveryAttempt).toHaveBeenCalledWith('delivery-123');
    expect(mockMarkDeliveryDelivered).toHaveBeenCalledWith('delivery-123');
    expect(result).toEqual({
      status: 'delivered',
      deliveryId: 'delivery-123',
      runId: 'run-123'
    });
  });

  it('schedules a retry when delivery fails but attempts remain', async () => {
    mockMarkDeliveryDelivered.mockRejectedValue(new Error('transient delivery outage'));

    const result = await handleDeliverySend(job);

    expect(mockComputeRetryDelayMs).toHaveBeenCalledWith(2, 1000);
    expect(mockMarkDeliveryPendingRetry).toHaveBeenCalledWith(
      'delivery-123',
      expect.any(String)
    );
    expect(mockEnqueueDeliveryRetry).toHaveBeenCalledWith({
      deliveryId: 'delivery-123',
      runId: 'run-123',
      userId: 'user-123',
      attemptCount: 2,
      delayMs: 5000
    });
    expect(result).toEqual(expect.objectContaining({
      status: 'retry_scheduled',
      deliveryId: 'delivery-123',
      nextAttemptCount: 2
    }));
  });

  it('marks the delivery failed and throws a permanent error after retry exhaustion', async () => {
    mockBeginDeliveryAttempt.mockResolvedValue({
      delivery_id: 'delivery-123',
      attempt_count: 4
    });
    mockMarkDeliveryDelivered.mockRejectedValue(new Error('persistent delivery outage'));

    await expect(handleDeliverySend(job)).rejects.toBeInstanceOf(PermanentJobError);

    expect(mockMarkDeliveryFailed).toHaveBeenCalledWith('delivery-123');
    expect(mockEnqueueDeliveryRetry).not.toHaveBeenCalled();
  });
});
