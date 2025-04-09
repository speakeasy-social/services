import baseConfig from '../../jest.config.js';

export default {
  ...baseConfig,
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@speakeasy-services/(.*)$': '<rootDir>/../../packages/$1/src',
    '^@prisma/client$': '<rootDir>/src/generated/prisma-client',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        paths: {
          '@prisma/client': ['./src/generated/prisma-client']
        }
      }
    }],
  },
}; 