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
  SERVICE_ADMIN_DATABASE_URL: z
    .string()
    .url()
    .describe('Database URL with service_admin schema for Prisma'),

  SPKEASY_HOST: z
    .string()
    .min(1)
    .describe('Host for Speakeasy front end'),

  STRIPE_SECRET_KEY: z
    .string()
    .min(1)
    .describe('Secret key for conneting to Stripe API'),
  } as const;

// Create and validate the config
const config = validateEnv(z.object(serviceSchema));

// Set SERVICE_ADMIN_DATABASE_URL using getDatabaseUrl
(config as any).SERVICE_ADMIN_DATABASE_URL = getDatabaseUrl(
  'service_admin',
  'SERVICE_ADMIN_DATABASE_URL',
);

// Export the config with proper typing
export type Config = typeof config;
export default config;
