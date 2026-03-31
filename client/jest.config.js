module.exports = {
  preset: 'react',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.jsx', '**/*.test.jsx'],
  collectCoverageFrom: [
    'client/src/**/*.{js,jsx}',
    '!client/src/**/*.test.{js,jsx}'
  ],
  coverageDirectory: 'client/coverage',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  verbose: true,
  testTimeout: 10000
};
