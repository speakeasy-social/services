import fs from 'fs';

import PgBoss, { SendOptions } from 'pg-boss';
import { z } from 'zod';
import { ValidationError } from '@speakeasy-services/common';

export const JOB_NAMES = {
  ADD_RECIPIENT_TO_SESSION: 'add-recipient-to-session',
  REVOKE_SESSION: 'revoke-session',
  UPDATE_USER_KEYS: 'update-user-keys',
  UPDATE_SESSION_KEYS: 'update-session-keys',
  POPULATE_DID_CACHE: 'populate-did-cache',
} as const;

const queueConfigSchema = z.object({
  connectionString: z.string(),
  schema: z.string().default('pgboss'),
  ssl: z
    .union([
      z.string(),
      z.object({
        rejectUnauthorized: z.boolean(),
        ca: z.string(),
      }),
    ])
    .optional(),
});

export const DEFAULT_RETRY_CONFIG = {
  retryLimit: 12,
  retryDelay: 60, // Start with 1 minute delay
  retryBackoff: true,
} as const;

export type QueueConfig = z.infer<typeof queueConfigSchema>;

export class Queue {
  private static instance: PgBoss;

  private constructor() {}

  static getInstance(config?: QueueConfig): PgBoss {
    if (!Queue.instance) {
      if (!config && !process.env.DATABASE_URL) {
        throw new ValidationError(
          'Queue config or DATABASE_URL environment variable is required',
        );
      }

      const parsedConfig = queueConfigSchema.parse({
        connectionString: config?.connectionString || process.env.DATABASE_URL,
        schema: config?.schema || process.env.PGBOSS_SCHEMA || 'pgboss',
        ssl: process.env.DATABASE_URL?.includes('sslmode=require')
          ? 'require'
          : undefined,
      });

      if (process.env.DATABASE_CERT) {
        parsedConfig.ssl = {
          rejectUnauthorized: false,
          ca: fs.readFileSync(process.env.DATABASE_CERT).toString(),
        };
      }

      Queue.instance = new PgBoss(parsedConfig);
    }
    return Queue.instance;
  }

  static async start(): Promise<void> {
    const instance = Queue.getInstance();
    await instance.start();
  }

  static async stop(): Promise<void> {
    if (Queue.instance) {
      await Queue.instance.stop();
    }
  }

  static async publish(
    jobName: string,
    data: any,
    config?: SendOptions,
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.send(jobName, data, {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    });
  }
}
