// Jest global setup — runs before each test suite.
// Mocks dotenv to prevent .env loading in tests.

jest.mock('dotenv', () => ({ config: jest.fn() }));
