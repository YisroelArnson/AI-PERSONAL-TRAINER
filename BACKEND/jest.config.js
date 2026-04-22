/**
 * File overview:
 * Provides the jest config logic used by this part of the codebase.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/__tests__/helpers/setup.js'],
  testTimeout: 10000
};
