/**
 * File overview:
 * Contains automated tests for the run stream service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { normalizeStreamEvent } = require('../../src/gateway/services/run-stream.service');

describe('normalizeStreamEvent', () => {
  it('maps assistant delta events into the SSE contract', () => {
    const normalized = normalizeStreamEvent({
      run_id: 'run-123',
      seq_num: 16,
      created_at: '2026-04-12T13:59:58.000Z',
      event_type: 'assistant.delta',
      payload: {
        iteration: 2,
        toolName: 'message_notify_user',
        toolUseId: 'toolu_123',
        text: 'Working through',
        delivery: 'feed',
        terminal: true
      }
    });

    expect(normalized).toEqual({
      id: 16,
      event: 'assistant.delta',
      data: {
        runId: 'run-123',
        eventId: 16,
        seqNum: 16,
        createdAt: '2026-04-12T13:59:58.000Z',
        type: 'assistant.delta',
        iteration: 2,
        toolName: 'message_notify_user',
        toolUseId: 'toolu_123',
        text: 'Working through',
        delivery: 'feed',
        terminal: true
      }
    });
  });

  it('maps tool call request events into the tool-native SSE contract', () => {
    const normalized = normalizeStreamEvent({
      run_id: 'run-123',
      seq_num: 17,
      created_at: '2026-04-12T14:00:00.000Z',
      event_type: 'tool.call.requested',
      payload: {
        iteration: 2,
        toolName: 'message_notify_user',
        toolUseId: 'toolu_123',
        text: 'Working through your plan now.',
        delivery: 'transient',
        terminal: false
      }
    });

    expect(normalized).toEqual({
      id: 17,
      event: 'tool.call.requested',
      data: {
        runId: 'run-123',
        eventId: 17,
        seqNum: 17,
        createdAt: '2026-04-12T14:00:00.000Z',
        type: 'tool.call.requested',
        iteration: 2,
        toolName: 'message_notify_user',
        toolUseId: 'toolu_123',
        text: 'Working through your plan now.',
        delivery: 'transient',
        terminal: false
      }
    });
  });

  it('maps tool call completion events including safe message payloads', () => {
    const normalized = normalizeStreamEvent({
      run_id: 'run-123',
      seq_num: 18,
      created_at: '2026-04-12T14:00:03.000Z',
      event_type: 'tool.call.completed',
      payload: {
        iteration: 2,
        toolName: 'message_ask_user',
        toolUseId: 'toolu_123',
        resultStatus: 'ok',
        text: 'Do you want the short version or the full workout?',
        delivery: 'feed',
        terminal: true
      }
    });

    expect(normalized).toEqual({
      id: 18,
      event: 'tool.call.completed',
      data: {
        runId: 'run-123',
        eventId: 18,
        seqNum: 18,
        createdAt: '2026-04-12T14:00:03.000Z',
        type: 'tool.call.completed',
        iteration: 2,
        toolName: 'message_ask_user',
        toolUseId: 'toolu_123',
        resultStatus: 'ok',
        text: 'Do you want the short version or the full workout?',
        delivery: 'feed',
        terminal: true
      }
    });
  });

  it('ignores legacy assistant phase stream events', () => {
    expect(normalizeStreamEvent({
      run_id: 'run-legacy',
      seq_num: 9,
      created_at: '2026-04-12T14:10:00.000Z',
      event_type: 'assistant.commentary.completed',
      payload: {
        text: 'Thinking...'
      }
    })).toBeNull();

    expect(normalizeStreamEvent({
      run_id: 'run-legacy',
      seq_num: 10,
      created_at: '2026-04-12T14:10:01.000Z',
      event_type: 'assistant.final.completed',
      payload: {
        text: 'Done.'
      }
    })).toBeNull();
  });
});
