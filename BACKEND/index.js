/**
 * File overview:
 * Provides the index logic used by this part of the codebase.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { app } = require('./src/app');
const { startServer } = require('./src/server');

if (require.main === module) {
  startServer();
}

module.exports = app;
