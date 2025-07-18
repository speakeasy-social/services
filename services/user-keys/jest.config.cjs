const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    '^@speakeasy-services/(.*)$': '<rootDir>/../../packages/$1/src',
    '^@prisma/client$': '<rootDir>/src/generated/prisma-client',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: true
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
};