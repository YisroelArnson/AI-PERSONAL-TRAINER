const {
  buildRedisSearchFilter,
  buildRedisTextQuery,
  parseRedisHybridSearchResponse,
  parseRedisTextSearchResponse,
  sanitizeRedisSegment
} = require('../../src/runtime/services/redis-retrieval-index.service');
const { parseVector, toFloat32Buffer } = require('../../src/runtime/services/embedding-cache.service');

describe('redis retrieval index helpers', () => {
  it('builds escaped Redis tag filters for user and sources', () => {
    expect(buildRedisSearchFilter({
      userId: 'user-123',
      sourceTypes: ['sessions', 'memory']
    })).toBe('@user_id:{user\\-123} @source_type:{sessions|memory}');
  });

  it('builds a Redis text query with tokens and filters', () => {
    expect(buildRedisTextQuery({
      queryText: 'what happened with squat PR?',
      userId: 'user-123',
      sourceTypes: ['sessions']
    })).toBe('what happened with squat PR @user_id:{user\\-123} @source_type:{sessions}');
  });

  it('parses Postgres vector literals and converts them to Float32 buffers', () => {
    const parsed = parseVector('[1,2.5,3]');
    const buffer = toFloat32Buffer('[1,2.5,3]');
    const roundTrip = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));

    expect(parsed).toEqual([1, 2.5, 3]);
    expect(roundTrip).toEqual([1, 2.5, 3]);
  });

  it('parses FT.HYBRID map-like responses into retrieval results', () => {
    const parsed = parseRedisHybridSearchResponse([
      'total_results',
      1,
      'results',
      [[
        '__key',
        'rchunk:text_embedding_3_small:abc',
        '__score',
        '0.73',
        'chunk_id',
        'abc',
        'source_type',
        'sessions',
        'source_id',
        'user:main:session',
        'start_seq_or_offset',
        '4',
        'end_seq_or_offset',
        '6',
        'content',
        'squat session excerpt'
      ]],
      'warnings',
      [],
      'execution_time',
      '0.48'
    ]);

    expect(parsed).toEqual({
      totalResults: 1,
      warnings: [],
      executionTimeMs: 0.48,
      results: [{
        redisKey: 'rchunk:text_embedding_3_small:abc',
        chunkId: 'abc',
        sourceType: 'sessions',
        sourceId: 'user:main:session',
        startSeqOrOffset: 4,
        endSeqOrOffset: 6,
        content: 'squat session excerpt',
        score: 0.73
      }]
    });
  });

  it('parses FT.SEARCH score responses into retrieval results', () => {
    const parsed = parseRedisTextSearchResponse([
      1,
      'rchunk:text_embedding_3_small:def',
      '1.568',
      [
        'chunk_id',
        'def',
        'source_type',
        'memory',
        'source_id',
        'MEMORY',
        'start_seq_or_offset',
        '0',
        'end_seq_or_offset',
        '20',
        'content',
        'current training preferences'
      ]
    ]);

    expect(parsed).toEqual({
      totalResults: 1,
      warnings: [],
      executionTimeMs: null,
      results: [{
        redisKey: 'rchunk:text_embedding_3_small:def',
        chunkId: 'def',
        sourceType: 'memory',
        sourceId: 'MEMORY',
        startSeqOrOffset: 0,
        endSeqOrOffset: 20,
        content: 'current training preferences',
        score: 1.568
      }]
    });
  });

  it('sanitizes Redis key segments deterministically', () => {
    expect(sanitizeRedisSegment('text-embedding-3-small')).toBe('text_embedding_3_small');
  });
});
