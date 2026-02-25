import fs from 'fs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

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

function getEncryptionKey(): Buffer {
  const secret = process.env.JOB_QUEUE_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'JOB_QUEUE_ENCRYPTION_KEY is not set — cannot encrypt/decrypt job field',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export class Queue {
  private static instance: PgBoss;

  /**
   * Encrypts a sensitive string field for storage in the job queue.
   * Output is base64-encoded: 12-byte IV + 16-byte auth tag + ciphertext.
   * Requires JOB_QUEUE_ENCRYPTION_KEY to be set in the environment.
   * Publish sites should also set _encrypted: 'v1' on the job payload.
   */
  static encryptField(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypts a field encrypted with encryptField().
   * Requires JOB_QUEUE_ENCRYPTION_KEY to be set in the environment.
   * Consume sites should check job.data._encrypted === 'v1' before calling this.
   */
  static decryptField(ciphertext: string): string {
    const key = getEncryptionKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

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
    if (!process.env.JOB_QUEUE_ENCRYPTION_KEY) {
      throw new Error(
        'JOB_QUEUE_ENCRYPTION_KEY must be set. Job queue field encryption is required.',
      );
    }
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
  ): Promise<void>;
  static async publish(
    jobName: string,
    data: object,
    config?: SendOptions,
  ): Promise<void>;
  static async publish(
    jobName: string,
    data: object,
    config?: SendOptions,
  ): Promise<void> {
    const queue = this.getInstance();
    await queue.send(jobName, data, {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    });
  }

  static async bulkPublish(
    config: JobInsert & { name: string },
    datas: object[],
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
