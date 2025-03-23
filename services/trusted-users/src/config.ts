import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  TRUSTED_USERS_PORT: z.string().transform(Number).default('3000'),
});

const config = configSchema.parse(process.env);

export { config };
