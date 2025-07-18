import z from 'zod';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// Load environment variables from root .env and service-specific .env
loadEnv({ path: join(process.cwd(), '../../.env') });
loadEnv({ path: join(process.cwd(), '.env') });

/**
 * Helper function to generate database URL based on environment
 */
export function getDatabaseUrl(schema: string): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbName = nodeEnv === 'test' ? 'speakeasy_test' : 'speakeasy';
  
  // If DATABASE_URL is explicitly set, use it as base and modify schema
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    return url.toString();
  }
  
  // Default local development URL
  return `postgresql://speakeasy:speakeasy@localhost:5496/${dbName}?schema=${schema}`;
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
  // Set DATABASE_URL if not provided
  if (!process.env.DATABASE_URL) {
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
