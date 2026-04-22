/**
 * File overview:
 * Contains automated tests for the session reset schema behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { parseSessionResetRequest } = require('../../src/gateway/schemas/session-reset.schema');

describe('parseSessionResetRequest', () => {
  it('accepts an empty body for the default session lane', () => {
    expect(parseSessionResetRequest(undefined)).toEqual({});
  });

  it('accepts an explicit session key override', () => {
    expect(parseSessionResetRequest({ sessionKey: 'User:123:Main' })).toEqual({
      sessionKey: 'User:123:Main'
    });
  });

  it('rejects an empty session key', () => {
    expect(() => parseSessionResetRequest({ sessionKey: '   ' })).toThrow();
  });
});
