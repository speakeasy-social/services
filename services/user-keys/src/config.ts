import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  USER_KEYS_PORT: z.string().transform(Number).default('3000'),
});

const config = configSchema.parse(process.env);

export { config };
