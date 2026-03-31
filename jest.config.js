module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/node_modules/**',
    '!server/tests/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000
};
