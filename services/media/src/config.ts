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
  MEDIA_DATABASE_URL: z
    .string()
    .url()
    .describe('Database URL with media schema for Prisma')
    .optional()
    .transform((url) => {
      // If MEDIA_DATABASE_URL is not set, construct it based on environment
      if (!url) {
        return getDatabaseUrl('media');
      }
      return url;
    }),
  // UpCloud S3 configuration
  MEDIA_S3_ENDPOINT: z.string().describe('S3 endpoint URL'),
  MEDIA_S3_REGION: z.string().describe('S3 region'),
  MEDIA_S3_ACCESS_KEY: z.string().describe('S3 access key'),
  MEDIA_S3_SECRET_KEY: z.string().describe('S3 secret key'),
  MEDIA_S3_BUCKET: z.string().describe('S3 bucket name'),
  MEDIA_SIZE_LIMIT: z
    .string()
    .transform(Number)
    .describe('Maximum media size limit'),
} as const;

// Create and validate the config
const config = validateEnv(z.object(serviceSchema));

// Export the config with proper typing
export type Config = typeof config;
export default config;
