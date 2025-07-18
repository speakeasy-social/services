import { getDatabaseUrl } from '../packages/service-base/src/config';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getDatabaseUrl', () => {
    it('should generate development database URL when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      const url = getDatabaseUrl('user_keys');
      expect(url).toBe('postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=user_keys');
    });

    it('should generate test database URL when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      const url = getDatabaseUrl('user_keys');
      expect(url).toBe('postgresql://speakeasy:speakeasy@localhost:5496/speakeasy_test?schema=user_keys');
    });

    it('should default to development database URL when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const url = getDatabaseUrl('user_keys');
      expect(url).toBe('postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=user_keys');
    });

    it('should use existing DATABASE_URL as base and modify schema when provided', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db?sslmode=require';
      const url = getDatabaseUrl('user_keys');
      expect(url).toBe('postgresql://user:pass@host:5432/db?sslmode=require&schema=user_keys');
    });

    it('should handle different schemas correctly', () => {
      process.env.NODE_ENV = 'test';
      const userKeysUrl = getDatabaseUrl('user_keys');
      const trustedUsersUrl = getDatabaseUrl('trusted_users');
      
      expect(userKeysUrl).toBe('postgresql://speakeasy:speakeasy@localhost:5496/speakeasy_test?schema=user_keys');
      expect(trustedUsersUrl).toBe('postgresql://speakeasy:speakeasy@localhost:5496/speakeasy_test?schema=trusted_users');
    });
  });
});