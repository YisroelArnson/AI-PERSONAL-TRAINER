const mockGetRedisConnection = jest.fn();

jest.mock('../../src/infra/redis/connection', () => ({
  getRedisConnection: mockGetRedisConnection
}));

const {
  takeTokenBucketTokens,
  refundTokenBucketTokens
} = require('../../src/infra/redis/token-bucket');

describe('token bucket redis wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests without enforcement when redis is unavailable', async () => {
    mockGetRedisConnection.mockReturnValue(null);

    const result = await takeTokenBucketTokens({
      key: 'rl:test:user',
      capacity: 10,
      refillPerSecond: 1
    });

    expect(result).toEqual({
      allowed: true,
      enforced: false,
      tokensRemaining: null,
      retryAfterSeconds: 0,
      retryAfterMs: 0,
      ttlMs: null
    });
  });

  it('parses denied redis responses with retry metadata', async () => {
    const evalMock = jest.fn().mockResolvedValue([0, '0.25', '1500', '5000']);
    mockGetRedisConnection.mockReturnValue({
      eval: evalMock
    });

    const result = await takeTokenBucketTokens({
      key: 'rl:test:user',
      capacity: 10,
      refillPerSecond: 0.5
    });

    expect(evalMock).toHaveBeenCalled();
    expect(result).toEqual({
      allowed: false,
      enforced: true,
      tokensRemaining: 0.25,
      retryAfterMs: 1500,
      retryAfterSeconds: 2,
      ttlMs: 5000
    });
  });

  it('parses refund results when tokens are credited back', async () => {
    const evalMock = jest.fn().mockResolvedValue(['6.5', '4000']);
    mockGetRedisConnection.mockReturnValue({
      eval: evalMock
    });

    const result = await refundTokenBucketTokens({
      key: 'rl:test:user',
      capacity: 10,
      refillPerSecond: 1,
      refundedTokens: 1
    });

    expect(result).toEqual({
      enforced: true,
      refunded: true,
      tokensRemaining: 6.5,
      ttlMs: 4000
    });
  });
});
