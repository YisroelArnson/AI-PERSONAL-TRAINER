const mockEnqueueSessionIndexSyncIfNeeded = jest.fn().mockResolvedValue();
const mockEnqueueSessionCompactionIfNeeded = jest.fn().mockResolvedValue();

let mockSupabaseState;
let mockRpc;
let consoleWarnSpy;

function applyFilters(rows, ctx) {
  let result = rows;

  for (const predicate of ctx.filters) {
    result = result.filter(predicate);
  }

  if (ctx.order) {
    result = [...result].sort((left, right) => {
      const leftValue = left[ctx.order.column];
      const rightValue = right[ctx.order.column];

      if (leftValue === rightValue) {
        return 0;
      }

      const comparison = leftValue > rightValue ? 1 : -1;
      return ctx.order.ascending ? comparison : -comparison;
    });
  }

  if (Number.isInteger(ctx.limit)) {
    result = result.slice(0, ctx.limit);
  }

  return result;
}

function mockCreateSupabaseBuilder(table) {
  const ctx = {
    filters: [],
    order: null,
    limit: null
  };

  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      ctx.filters.push(row => row[column] === value);
      return builder;
    },
    gt(column, value) {
      ctx.filters.push(row => Number(row[column]) > Number(value));
      return builder;
    },
    order(column, { ascending }) {
      ctx.order = {
        column,
        ascending
      };
      return builder;
    },
    limit(count) {
      ctx.limit = count;
      return builder;
    },
    async maybeSingle() {
      const result = await builder._execute();
      return {
        data: Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null),
        error: result.error
      };
    },
    async single() {
      const result = await builder._execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] : result.data,
        error: result.error
      };
    },
    async _execute() {
      if (table === 'session_state') {
        return {
          data: applyFilters(mockSupabaseState.sessionState, ctx),
          error: null
        };
      }

      if (table === 'session_events') {
        return {
          data: applyFilters(mockSupabaseState.sessionEvents, ctx),
          error: null
        };
      }

      throw new Error(`Unexpected Supabase table: ${table}`);
    },
    then(resolve, reject) {
      return builder._execute().then(resolve, reject);
    }
  };

  return builder;
}

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    rpc: (...args) => mockRpc(...args),
    from: table => mockCreateSupabaseBuilder(table)
  }))
}));

jest.mock('../../src/runtime/services/indexing-queue.service', () => ({
  enqueueSessionIndexSyncIfNeeded: mockEnqueueSessionIndexSyncIfNeeded
}));

jest.mock('../../src/runtime/services/session-compaction.service', () => ({
  enqueueSessionCompactionIfNeeded: mockEnqueueSessionCompactionIfNeeded
}));

const { appendAssistantEvent } = require('../../src/runtime/services/transcript-write.service');

describe('appendAssistantEvent guarded durable writes', () => {
  const run = {
    user_id: 'user-123',
    run_id: 'run-123',
    session_key: 'user:user-123:main',
    session_id: 'session-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockSupabaseState = {
      sessionState: [
        {
          id: 'state-1',
          user_id: 'user-123',
          session_key: 'user:user-123:main',
          current_session_id: 'session-123',
          leaf_event_id: 'evt-user-4',
          session_version: 12
        }
      ],
      sessionEvents: [
        {
          user_id: 'user-123',
          session_key: 'user:user-123:main',
          session_id: 'session-123',
          run_id: 'run-123',
          actor: 'user',
          seq_num: 4
        }
      ]
    };

    mockRpc = jest.fn().mockResolvedValue({
      data: {
        skipped: false,
        eventId: 'evt-assistant-5',
        sessionKey: 'user:user-123:main',
        sessionId: 'session-123',
        sessionVersion: 13,
        seqNum: 5,
        mode: 'guarded_rpc'
      },
      error: null
    });
  });

  afterEach(() => {
    if (consoleWarnSpy) {
      consoleWarnSpy.mockRestore();
    }
  });

  it('uses the guarded RPC and enqueues transcript maintenance when the reply is committed', async () => {
    const result = await appendAssistantEvent({
      run,
      eventType: 'assistant.notify',
      text: 'Committed reply.',
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'notify',
        delivery: 'feed'
      }
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'append_assistant_event_if_latest_turn',
      expect.objectContaining({
        p_user_id: 'user-123',
        p_session_key: 'user:user-123:main',
        p_session_id: 'session-123',
        p_run_id: 'run-123',
        p_event_type: 'assistant.notify'
      })
    );
    expect(result).toEqual(expect.objectContaining({
      skipped: false,
      eventId: 'evt-assistant-5',
      seqNum: 5
    }));
    expect(mockEnqueueSessionIndexSyncIfNeeded).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123'
    });
    expect(mockEnqueueSessionCompactionIfNeeded).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionKey: 'user:user-123:main',
      sessionId: 'session-123'
    });
  });

  it('does not enqueue maintenance when the guarded RPC suppresses a stale reply', async () => {
    mockRpc.mockResolvedValue({
      data: {
        skipped: true,
        reason: 'stale_user_turn',
        sessionKey: 'user:user-123:main',
        sessionId: 'session-123',
        sessionVersion: 12,
        triggerSeqNum: 4,
        latestUserSeqNum: 7,
        mode: 'guarded_rpc'
      },
      error: null
    });

    const result = await appendAssistantEvent({
      run,
      eventType: 'assistant.ask',
      text: 'Outdated question.',
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'ask',
        delivery: 'feed'
      }
    });

    expect(result).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'stale_user_turn',
      latestUserSeqNum: 7
    }));
    expect(mockEnqueueSessionIndexSyncIfNeeded).not.toHaveBeenCalled();
    expect(mockEnqueueSessionCompactionIfNeeded).not.toHaveBeenCalled();
  });

  it('falls back to an app-side stale-turn check when the guarded RPC is unavailable', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('function append_assistant_event_if_latest_turn does not exist')
    });
    mockSupabaseState.sessionEvents.push({
      user_id: 'user-123',
      session_key: 'user:user-123:main',
      session_id: 'session-123',
      run_id: 'run-newer',
      actor: 'user',
      seq_num: 7
    });

    const result = await appendAssistantEvent({
      run,
      eventType: 'assistant.notify',
      text: 'Fallback stale reply.',
      requireLatestUserTurn: true,
      extraPayload: {
        kind: 'notify',
        delivery: 'feed'
      }
    });

    expect(result).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'stale_user_turn',
      triggerSeqNum: 4,
      latestUserSeqNum: 7,
      mode: 'guarded_fallback'
    }));
    expect(mockEnqueueSessionIndexSyncIfNeeded).not.toHaveBeenCalled();
    expect(mockEnqueueSessionCompactionIfNeeded).not.toHaveBeenCalled();
  });
});
