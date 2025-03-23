import { z } from 'zod';
import { ValidationError } from '@speakeasy-services/common';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string(),
  PGBOSS_SCHEMA: z.string().default('pgboss'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new ValidationError('Invalid environment variables');
  }

  return result.data;
}

export const config = loadConfig();
