/**
 * File overview:
 * Contains automated tests for the concurrency policy service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  buildEffectiveConcurrencyPolicy
} = require('../../src/runtime/services/concurrency-policy.service');

describe('buildEffectiveConcurrencyPolicy', () => {
  it('returns the default concurrency caps for the standard tier', () => {
    const policy = buildEffectiveConcurrencyPolicy({});

    expect(policy).toEqual({
      planTier: 'standard',
      maxActiveRuns: 20,
      maxActiveStreams: 20,
      maxActiveStreamsPerDevice: 20,
      retryHintSeconds: 30
    });
  });

  it('applies concurrency overrides from camelCase and snake_case keys', () => {
    const policy = buildEffectiveConcurrencyPolicy({
      planTier: 'premium_hybrid',
      policyOverrides: {
        concurrency: {
          maxActiveRuns: 12,
          max_active_streams: 9,
          max_active_streams_per_device: 6,
          retryHintSeconds: 4
        },
        rate_limit: {
          retry_hint_seconds: 11
        }
      }
    });

    expect(policy).toEqual({
      planTier: 'premium_hybrid',
      maxActiveRuns: 12,
      maxActiveStreams: 9,
      maxActiveStreamsPerDevice: 6,
      retryHintSeconds: 4
    });
  });

  it('falls back to legacy rate-limit retry hints when concurrency hints are absent', () => {
    const policy = buildEffectiveConcurrencyPolicy({
      policyOverrides: {
        rateLimit: {
          retryHintSeconds: 8
        }
      }
    });

    expect(policy.retryHintSeconds).toBe(8);
  });
});
