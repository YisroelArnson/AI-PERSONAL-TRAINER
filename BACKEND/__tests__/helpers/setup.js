/**
 * File overview:
 * Contains automated tests for the setup behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

// Jest global setup — runs before each test suite.
// Mocks dotenv to prevent .env loading in tests.

jest.mock('dotenv', () => ({ config: jest.fn() }));
