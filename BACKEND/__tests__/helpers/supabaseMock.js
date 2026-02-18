/**
 * Supabase mock factory for jest.mock('@supabase/supabase-js').
 *
 * Usage in test files:
 *
 *   jest.mock('@supabase/supabase-js', () => {
 *     const { buildSupabaseMock } = require('./helpers/supabaseMock');
 *     return buildSupabaseMock();
 *   });
 *   const { __mockChain: mockChain } = require('@supabase/supabase-js');
 */

function buildSupabaseMock() {
  const chain = {};
  let currentTable = null;
  const tableResponses = {};

  const chainMethods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'is',
    'order', 'limit', 'range', 'head'
  ];

  chain.from = jest.fn((table) => {
    currentTable = table;
    return chain;
  });

  for (const method of chainMethods) {
    chain[method] = jest.fn(() => chain);
  }

  chain._data = null;
  chain._error = null;
  chain._count = null;

  function getResponse() {
    if (currentTable && tableResponses[currentTable]) {
      const resp = tableResponses[currentTable];
      return { data: resp.data, error: resp.error };
    }
    return { data: chain._data, error: chain._error };
  }

  chain.single = jest.fn(() => Promise.resolve(getResponse()));
  chain.maybeSingle = jest.fn(() => Promise.resolve(getResponse()));

  chain.then = function (resolve, reject) {
    const result = getResponse();
    if (chain._count !== null) result.count = chain._count;
    return Promise.resolve(result).then(resolve, reject);
  };

  // Simple data helpers (set default response for all tables)
  chain.mockResolve = (data) => { chain._data = data; chain._error = null; chain._count = null; return chain; };
  chain.mockReject = (error) => { chain._data = null; chain._error = error; chain._count = null; return chain; };
  chain.mockResolveWithCount = (data, count) => { chain._data = data; chain._error = null; chain._count = count; return chain; };

  // Per-table response (useful for multi-query functions)
  chain.mockTable = (table, data, error = null) => {
    tableResponses[table] = { data, error };
    return chain;
  };

  chain.reset = () => {
    chain._data = null;
    chain._error = null;
    chain._count = null;
    currentTable = null;
    Object.keys(tableResponses).forEach(k => delete tableResponses[k]);
    chain.from.mockClear();
    for (const method of chainMethods) {
      chain[method].mockClear();
    }
    chain.single.mockClear();
    chain.maybeSingle.mockClear();
  };

  return {
    createClient: jest.fn(() => chain),
    __mockChain: chain
  };
}

module.exports = { buildSupabaseMock };
