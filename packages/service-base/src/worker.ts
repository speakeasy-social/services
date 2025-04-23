import { Queue, QueueConfig } from '@speakeasy-services/queue';

import { createLogger } from '@speakeasy-services/common';
import { validateEnv } from './config.js';
import { baseSchema } from './config.js';
import { z } from 'zod';

export interface WorkerOptions {
  name: string;
  queueConfig?: QueueConfig;
}

export class Worker {
  private options: WorkerOptions;

  queue: ReturnType<typeof Queue.getInstance>;
  config: ReturnType<typeof validateEnv<typeof baseSchema>>;
  logger: ReturnType<typeof createLogger>;

  constructor(options: WorkerOptions) {
    this.config = validateEnv(z.object(baseSchema));
    this.logger = createLogger({
      serviceName: options.name,
      level: this.config.LOG_LEVEL,
    });

    this.options = options;
    this.queue = Queue.getInstance({
      connectionString: process.env.DATABASE_URL!,
      schema: process.env.PGBOSS_SCHEMA || 'pgboss',
    });
  }

  async start(): Promise<void> {
    await Queue.start();
  }

  async stop(): Promise<void> {
    await Queue.stop();
  }
}
