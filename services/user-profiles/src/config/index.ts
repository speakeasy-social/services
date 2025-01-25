import { config as dotenv } from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv();

// Configuration schema
const ConfigSchema = z.object({
  port: z.coerce.number().default(3001),
  host: z.string().default('127.0.0.1'),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  databaseUrl: z.string(),
});

// Parse and validate configuration
export const config = ConfigSchema.parse({
  port: process.env.PORT,
  host: process.env.HOST,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.LOG_LEVEL,
  databaseUrl: process.env.DATABASE_URL,
});
