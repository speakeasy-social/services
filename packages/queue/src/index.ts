import fs from 'fs';

import PgBoss, { SendOptions, JobInsert } from 'pg-boss';
import { z } from 'zod';
import { ValidationError } from '@speakeasy-services/common';
import type { JobDataMap } from './types.js';

export const JOB_NAMES = {
  ADD_RECIPIENT_TO_SESSION: 'add-recipient-to-session',
  DELETE_MEDIA: 'delete-media',
  REVOKE_SESSION: 'revoke-session',
  DELETE_SESSION_KEYS: 'delete-session-keys',
  UPDATE_USER_KEYS: 'update-user-keys',
  UPDATE_SESSION_KEYS: 'update-session-keys',
  POPULATE_DID_CACHE: 'populate-did-cache',
  NOTIFY_REACTION: 'notify-reaction',
  NOTIFY_REPLY: 'notify-reply',
} as const;

// Re-export types
export type { Job, JobName } from './types.js';

/**
 * Generate a service-specific job name by prefixing the base job name with the service name
 * @param serviceName - The name of the service (e.g., 'private-sessions', 'private-profiles')
 * @param baseJobName - The base job name from JOB_NAMES
 * @returns A service-specific job name
 */
export function getServiceJobName(
  serviceName: string,
  baseJobName: string,
): string {
  return `${serviceName}.${baseJobName}`;
}

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

  static async publish<K extends keyof JobDataMap>(
    jobName: K,
    data: JobDataMap[K],
    config?: SendOptions,
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.send(jobName, data, {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    });
  }

  static async bulkPublish<K extends keyof JobDataMap>(
    config: JobInsert & { name: K },
    datas: JobDataMap[K][],
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.insert(
      datas.map((data) => ({
        data,
        ...DEFAULT_RETRY_CONFIG,
        ...config,
      })),
    );
  }

  /**
   * Publish a job with a dynamic (service-prefixed) job name.
   * Use this for jobs that need to be routed to specific services.
   * @param jobName - The full job name (e.g., 'private-sessions.add-recipient-to-session')
   * @param data - The job data
   * @param config - Optional send configuration
   */
  static async publishDynamic<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    config?: SendOptions,
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.send(jobName, data, {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    });
  }

  /**
   * Bulk publish jobs with a dynamic (service-prefixed) job name.
   * Use this for jobs that need to be routed to specific services.
   * @param config - Job configuration including the full job name
   * @param datas - Array of job data objects
   */
  static async bulkPublishDynamic<T extends Record<string, unknown>>(
    config: JobInsert & { name: string },
    datas: T[],
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.insert(
      datas.map((data) => ({
        data,
        ...DEFAULT_RETRY_CONFIG,
        ...config,
      })),
    );
  }
}
