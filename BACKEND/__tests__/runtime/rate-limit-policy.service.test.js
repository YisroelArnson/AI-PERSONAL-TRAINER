const {
  buildEffectiveRateLimitPolicy
} = require('../../src/runtime/services/rate-limit-policy.service');

describe('buildEffectiveRateLimitPolicy', () => {
  it('returns spec-aligned defaults for the standard tier', () => {
    const policy = buildEffectiveRateLimitPolicy({});

    expect(policy).toEqual({
      planTier: 'standard',
      messages: {
        capacity: 100,
        refillPerSecond: 5,
        deviceCapacity: 100,
        deviceRefillPerSecond: 5,
        ipCapacity: 100,
        ipRefillPerSecond: 5
      },
      retryHintSeconds: 30
    });
  });

  it('applies camelCase and snake_case rate-limit overrides', () => {
    const policy = buildEffectiveRateLimitPolicy({
      planTier: 'premium_hybrid',
      policyOverrides: {
        rateLimit: {
          messages: {
            capacity: 12,
            refillPerSecond: 0.75,
            deviceCapacity: 0
          }
        },
        rate_limit: {
          messages: {
            device_refill_per_second: 0,
            ip_capacity: 22,
            ip_refill_per_second: 1.5
          },
          retry_hint_seconds: 9
        }
      }
    });

    expect(policy).toEqual({
      planTier: 'premium_hybrid',
      messages: {
        capacity: 12,
        refillPerSecond: 0.75,
        deviceCapacity: 0,
        deviceRefillPerSecond: 0,
        ipCapacity: 22,
        ipRefillPerSecond: 1.5
      },
      retryHintSeconds: 9
    });
  });
});
