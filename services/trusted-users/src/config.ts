import {
  validateEnv,
  baseSchema,
  getDatabaseUrl,
} from '@speakeasy-services/service-base/config';
import z from 'zod';

/**
 * Service-specific configuration schema.
 * Uses shared config from root .env and adds service-specific fields.
 */
const serviceSchema = {
  ...baseSchema,
  // Service-specific configurations
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  // Service database - isolated schema for this service
  TRUSTED_USERS_DATABASE_URL: z
    .string()
    .url()
    .describe('Database URL with trusted_users schema for Prisma'),
} as const;

// Create and validate the config
const config = validateEnv(z.object(serviceSchema));

// Set TRUSTED_USERS_DATABASE_URL using getDatabaseUrl
(config as any).TRUSTED_USERS_DATABASE_URL = getDatabaseUrl(
  'trusted_users',
  'TRUSTED_USERS_DATABASE_URL',
);

// Export the config with proper typing
export type Config = typeof config;
export default config;
