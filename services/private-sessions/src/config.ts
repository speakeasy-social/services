import { validateEnv, baseSchema, getDatabaseUrl } from '@speakeasy-services/service-base/config';
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
  PRIVATE_SESSIONS_DATABASE_URL: z
    .string()
    .url()
    .describe('Database URL with private_sessions schema for Prisma')
    .optional()
    .transform((url) => {
      // If PRIVATE_SESSIONS_DATABASE_URL is not set, construct it based on environment
      if (!url) {
        return getDatabaseUrl('private_sessions');
      }
      return url;
    }),
} as const;

// Create and validate the config
const config = validateEnv(z.object(serviceSchema));

// Export the config with proper typing
export type Config = typeof config;
export default config;
