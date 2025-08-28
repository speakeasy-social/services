import z from 'zod';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// Load environment variables from root .env and service-specific .env
loadEnv({ path: join(process.cwd(), '../../.env') });
loadEnv({ path: join(process.cwd(), '.env') });

/**
 * Helper function to generate database URL based on environment
 */
export function getDatabaseUrl(schema: string, serviceEnvVar?: string): string {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // In test environment, always use test database
  if (nodeEnv === 'test') {
    const testDbName = process.env.TEST_DB_NAME || 'speakeasy_test';
    return `postgresql://speakeasy:speakeasy@localhost:5496/${testDbName}?schema=${schema}`;
  }

  // In production and development, serviceEnvVar MUST be provided and set
  if (!serviceEnvVar || !process.env[serviceEnvVar]) {
    throw new Error(
      `Database URL for schema '${schema}' must be explicitly set via ${serviceEnvVar} in ${nodeEnv} environment`,
    );
  }

  const url = new URL(process.env[serviceEnvVar]!);
  url.searchParams.set('schema', schema);
  return url.toString();
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
  // Worker (PgBoss) database - shared across all services
  DATABASE_URL: z
    .string()
    .url()
    .describe('Shared database URL for PgBoss worker')
    .optional(), // Optional since it can be derived from environment
  PGBOSS_SCHEMA: z
    .string()
    .default('pgboss')
    .describe('Schema for PgBoss jobs'),
  // Test database configuration
  TEST_DB_NAME: z
    .string()
    .default('speakeasy_test')
    .describe('Database name to use for test environment'),
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
  USER_KEYS_HOST: z
    .string()
    .min(1)
    .describe('Host for user-keys service'),
  SERVICE_ADMIN_HOST: z
    .string()
    .min(1)
    .describe('Host for service-admin service'),
  SPKEASY_HOST: z
    .string()
    .min(1)
    .describe('Host for Speakeasy front end'),

  STRIPE_SECRET_KEY: z
    .string()
    .min(1)
    .describe('Secret key for conneting to Stripe API'),

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
  // Set DATABASE_URL if not provided (only for development/test)
  if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
    process.env.DATABASE_URL = getDatabaseUrl('pgboss');
  }

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
