/**
 * File overview:
 * Contains automated tests for the retrieval policy service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  buildEffectiveRetrievalPolicy
} = require('../../src/runtime/services/retrieval-policy.service');

describe('buildEffectiveRetrievalPolicy', () => {
  it('returns spec-aligned defaults for indexing and retrieval', () => {
    const policy = buildEffectiveRetrievalPolicy({});

    expect(policy).toEqual({
      planTier: 'standard',
      sessionIndexingEnabled: true,
      sessionDeltaBytes: 4096,
      sessionDeltaMessages: 5,
      queryMaxResults: 8,
      queryCandidateMultiplier: 4,
      queryBackend: 'redis_hybrid',
      sources: ['sessions', 'memory', 'program', 'episodic_date'],
      embeddingMonthlyBudget: null
    });
  });

  it('applies override values and filters unsupported sources', () => {
    const policy = buildEffectiveRetrievalPolicy({
      planTier: 'premium_hybrid',
      policyOverrides: {
        sessionIndexing: {
          enabled: 'false'
        },
        sync: {
          sessions: {
            deltaBytes: 1024,
            deltaMessages: 2
          }
        },
        query: {
          maxResults: 4,
          candidateMultiplier: 6,
          backend: 'postgres_fallback'
        },
        sources: ['memory', 'program', 'invalid']
      }
    });

    expect(policy).toEqual({
      planTier: 'premium_hybrid',
      sessionIndexingEnabled: false,
      sessionDeltaBytes: 1024,
      sessionDeltaMessages: 2,
      queryMaxResults: 4,
      queryCandidateMultiplier: 6,
      queryBackend: 'postgres_fallback',
      sources: ['memory', 'program'],
      embeddingMonthlyBudget: null
    });
  });
});
