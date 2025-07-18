import z from 'zod';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// Load environment variables from root .env and service-specific .env
loadEnv({ path: join(process.cwd(), '../../.env') });
loadEnv({ path: join(process.cwd(), '.env') });

/**
 * Helper function to get database configuration based on environment
 */
export function getDatabaseConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Use environment variables for database configuration
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'speakeasy';
  const password = process.env.DB_PASSWORD || 'speakeasy';
  
  // Only the database name changes based on environment
  const database = nodeEnv === 'test' 
    ? (process.env.DB_NAME_TEST || 'speakeasy_test')
    : (process.env.DB_NAME || 'speakeasy');
  
  return {
    host,
    port,
    user,
    password,
    database,
  };
}

/**
 * Helper function to construct database URL for a specific schema
 */
export function getDatabaseUrl(schema: string): string {
  const config = getDatabaseConfig();
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}?schema=${schema}`;
}

/**
 * Base configuration schema that services can extend.
 * These are truly shared configurations that should be in the root .env
 */
export const baseSchema = {
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z.string().default('info'),
  // Database configuration
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_USER: z.string().default('speakeasy'),
  DB_PASSWORD: z.string().default('speakeasy'),
  DB_NAME: z.string().default('speakeasy'),
  DB_NAME_TEST: z.string().default('speakeasy_test'),
  // Worker (PgBoss) database - shared across all services
  DATABASE_URL: z
    .string()
    .url()
    .describe('Shared database URL for PgBoss worker')
    .transform((url) => {
      // If DATABASE_URL is not set or is a placeholder, construct it based on environment
      if (!url || url === 'placeholder') {
        return getDatabaseUrl('pgboss');
      }
      return url;
    }),
  PGBOSS_SCHEMA: z
    .string()
    .default('pgboss')
    .describe('Schema for PgBoss jobs'),
  // Service API keys for inter-service communication
  PRIVATE_SESSIONS_API_KEY: z
    .string()
    .min(1)
    .describe('API key for private-sessions service'),
  TRUSTED_USERS_API_KEY: z
    .string()
    .min(1)
    .describe('API key for trusted-users service'),
  USER_KEYS_API_KEY: z
    .string()
    .min(1)
    .describe('API key for user-keys service'),
  SERVICE_ADMIN_API_KEY: z
    .string()
    .min(1)
    .describe('API key for user-keys service'),

  PRIVATE_SESSIONS_HOST: z
    .string()
    .min(1)
    .describe('Host for private-sessions service'),
  TRUSTED_USERS_HOST: z
    .string()
    .min(1)
    .describe('Host for trusted-users service'),
  USER_KEYS_HOST: z.string().min(1).describe('Host for user-keys service'),
  SERVICE_ADMIN_HOST: z
    .string()
    .min(1)
    .describe('Host for service-admin service'),

  HMAC_SECRET: z.string().min(1).describe('Secret key for HMAC hashing'),
  LOG_SALT: z.string().min(1).describe('Salt for HMAC hashing'),
} as const;

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Helper function to create a validated config from environment variables.
 * Services should use this to create their own config with their specific schema.
 */
export function validateEnv<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    throw new ValidationError('Invalid environment variables', errors);
  }

  return result.data;
}
