/**
 * File overview:
 * Contains automated tests for the run read service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const mockGetLatestDeliveryRecordForRun = jest.fn();
const mockGetStreamEventBounds = jest.fn();
const mockGetRunById = jest.fn();

jest.mock('../../src/runtime/services/delivery-outbox.service', () => ({
  getLatestDeliveryRecordForRun: mockGetLatestDeliveryRecordForRun
}));

jest.mock('../../src/runtime/services/stream-events.service', () => ({
  getStreamEventBounds: mockGetStreamEventBounds
}));

jest.mock('../../src/runtime/services/run-state.service', () => ({
  getRunById: mockGetRunById
}));

const { buildRunResultView, buildRunStatusView } = require('../../src/gateway/services/run-read.service');

describe('run-read.service', () => {
  const baseRun = {
    run_id: 'run-123',
    user_id: 'user-123',
    status: 'succeeded',
    trigger_type: 'user.message',
    session_key: 'session-key',
    session_id: 'session-123',
    created_at: '2026-04-12T10:00:00.000Z',
    started_at: '2026-04-12T10:00:05.000Z',
    finished_at: '2026-04-12T10:00:25.000Z',
    provider_key: 'anthropic',
    model_key: 'claude-sonnet-4-6',
    error_code: null,
    error_message: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRunById.mockResolvedValue(baseRun);
    mockGetLatestDeliveryRecordForRun.mockResolvedValue(null);
    mockGetStreamEventBounds.mockResolvedValue({
      firstSeqNum: 1,
      lastSeqNum: 8
    });
  });

  it('builds a durable run status payload with delivery and stream metadata', async () => {
    mockGetLatestDeliveryRecordForRun.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'delivered',
      delivered_at: '2026-04-12T10:00:26.000Z'
    });

    const result = await buildRunStatusView({
      runId: 'run-123',
      userId: 'user-123'
    });

    expect(result).toEqual(expect.objectContaining({
      runId: 'run-123',
      status: 'succeeded',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      stream: expect.objectContaining({
        url: '/v1/runs/run-123/stream',
        resultUrl: '/v1/runs/run-123/result',
        firstSeqNum: 1,
        lastSeqNum: 8
      }),
      delivery: expect.objectContaining({
        deliveryId: 'delivery-123',
        status: 'delivered',
        resultUrl: '/v1/runs/run-123/result'
      })
    }));
  });

  it('rejects access when the run is not owned by the caller', async () => {
    mockGetRunById.mockResolvedValue({
      ...baseRun,
      user_id: 'another-user'
    });

    await expect(buildRunStatusView({
      runId: 'run-123',
      userId: 'user-123'
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found'
    });
  });

  it('returns 202 until a durable final result is available', async () => {
    mockGetLatestDeliveryRecordForRun.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'pending'
    });

    const result = await buildRunResultView({
      runId: 'run-123',
      userId: 'user-123'
    });

    expect(result).toEqual({
      httpStatus: 202,
      body: {
        runId: 'run-123',
        status: 'succeeded',
        deliveryStatus: 'pending',
        ready: false
      }
    });
  });

  it('returns the normalized durable payload once delivery completes', async () => {
    mockGetLatestDeliveryRecordForRun.mockResolvedValue({
      delivery_id: 'delivery-123',
      status: 'delivered',
      payload: {
        channel: 'in_app',
        content: {
          text: 'Here is your answer.'
        }
      }
    });

    const result = await buildRunResultView({
      runId: 'run-123',
      userId: 'user-123'
    });

    expect(result).toEqual({
      httpStatus: 200,
      body: {
        runId: 'run-123',
        status: 'succeeded',
        deliveryStatus: 'delivered',
        ready: true,
        payload: {
          channel: 'in_app',
          content: {
            text: 'Here is your answer.'
          }
        }
      }
    });
  });
});
