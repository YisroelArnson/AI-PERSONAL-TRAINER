/**
 * File overview:
 * Contains automated tests for the message rate limit service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const mockTakeTokenBucketTokens = jest.fn();
const mockRefundTokenBucketTokens = jest.fn();

jest.mock('../../src/infra/redis/token-bucket', () => ({
  takeTokenBucketTokens: mockTakeTokenBucketTokens,
  refundTokenBucketTokens: mockRefundTokenBucketTokens
}));

const {
  admitMessageRequest,
  releaseMessageRateLimitReservation
} = require('../../src/gateway/services/message-rate-limit.service');

describe('message rate-limit admission', () => {
  const rateLimitPolicy = {
    messages: {
      capacity: 20,
      refillPerSecond: 0.5,
      deviceCapacity: 5,
      deviceRefillPerSecond: 0.25,
      ipCapacity: 10,
      ipRefillPerSecond: 1
    },
    retryHintSeconds: 30
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checks user, device, and ip scopes when all are configured', async () => {
    mockTakeTokenBucketTokens.mockResolvedValue({
      enforced: true,
      allowed: true,
      tokensRemaining: 4,
      retryAfterSeconds: 0
    });

    const result = await admitMessageRequest({
      userId: 'user-123',
      headers: {
        'x-device-id': 'device-abc'
      },
      ipAddress: '::ffff:127.0.0.1',
      rateLimitPolicy
    });

    expect(mockTakeTokenBucketTokens).toHaveBeenCalledTimes(3);
    expect(result.decisions.map(decision => decision.scope)).toEqual(['user', 'device', 'ip']);
    expect(result.reservation.scopes).toHaveLength(3);
  });

  it('refunds earlier scopes when a later scope is denied', async () => {
    mockTakeTokenBucketTokens
      .mockResolvedValueOnce({
        enforced: true,
        allowed: true,
        tokensRemaining: 19,
        retryAfterSeconds: 0
      })
      .mockResolvedValueOnce({
        enforced: true,
        allowed: false,
        tokensRemaining: 0,
        retryAfterSeconds: 4
      });

    await expect(admitMessageRequest({
      userId: 'user-123',
      headers: {
        'x-device-id': 'device-abc'
      },
      ipAddress: null,
      rateLimitPolicy
    })).rejects.toMatchObject({
      statusCode: 429,
      details: {
        scope: 'device',
        retry_after_seconds: 4
      }
    });

    expect(mockRefundTokenBucketTokens).toHaveBeenCalledTimes(1);
    expect(mockRefundTokenBucketTokens.mock.calls[0][0]).toEqual(expect.objectContaining({
      capacity: 20,
      refillPerSecond: 0.5,
      refundedTokens: 1
    }));
  });

  it('refunds all reserved scopes when explicitly released', async () => {
    mockRefundTokenBucketTokens.mockResolvedValue({
      enforced: true,
      refunded: true
    });

    await releaseMessageRateLimitReservation({
      scopes: [
        {
          key: 'scope-1',
          capacity: 20,
          refillPerSecond: 0.5,
          requestedTokens: 1
        },
        {
          key: 'scope-2',
          capacity: 10,
          refillPerSecond: 1,
          requestedTokens: 1
        }
      ]
    });

    expect(mockRefundTokenBucketTokens).toHaveBeenCalledTimes(2);
  });
});
