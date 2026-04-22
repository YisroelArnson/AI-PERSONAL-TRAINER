/**
 * File overview:
 * Implements the trainer tool handler for memory search.
 *
 * Main functions in this file:
 * - execute: Executes the main action flow.
 */

const { retrievalSearch } = require('../../services/retrieval-search.service');

const definition = {
  name: 'memory_search',
  category: 'context',
  mutating: false,
  description: 'Search indexed session history, durable memory, program markdown, and episodic notes with provenance-aware ranking.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1
      },
      max_results: {
        type: 'integer',
        minimum: 1,
        maximum: 8
      },
      sources: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['sessions', 'memory', 'program', 'episodic_date']
        },
        minItems: 1,
        uniqueItems: true
      }
    },
    required: ['query'],
    additionalProperties: false
  }
};

/**
 * Executes the main action flow.
 */
async function execute({ input, userId, run }) {
  const normalizedQuery = String(input.query || '').trim();

  if (!normalizedQuery) {
    return {
      status: 'validation_error',
      error: {
        code: 'EMPTY_QUERY',
        explanation: 'query must be a non-empty string.',
        agent_guidance: 'Provide a specific question or search phrase for retrieval.',
        retryable_in_run: true
      }
    };
  }

  const result = await retrievalSearch({
    userId,
    sessionKey: run.session_key,
    runId: run.run_id,
    queryText: normalizedQuery,
    sources: input.sources,
    maxResults: input.max_results
  });

  return {
    status: 'ok',
    output: {
      queryId: result.queryId,
      backend: result.backend,
      requestedBackend: result.requestedBackend,
      sources: result.sources,
      results: result.results.map(entry => ({
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        startSeqOrOffset: entry.startSeqOrOffset,
        endSeqOrOffset: entry.endSeqOrOffset,
        chunkId: entry.chunkId,
        score: entry.score,
        content: entry.content
      }))
    }
  };
}

module.exports = {
  definition,
  execute
};
