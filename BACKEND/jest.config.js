module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/__tests__/helpers/setup.js'],
  testTimeout: 10000
};
