import express from 'express';

import { Queue, QueueConfig } from '@speakeasy-services/queue';
import { createLogger } from '@speakeasy-services/common';
import { validateEnv } from './config.js';
import { baseSchema } from './config.js';
import { z } from 'zod';
import { Job } from '@speakeasy-services/queue/types';
import { healthCheckAPI } from './health.js';

export interface WorkerOptions {
  name: string;
  queueConfig?: QueueConfig;
  port: number;
  healthCheck: () => Promise<void>;
}

export class Worker {
  private options: WorkerOptions;
  private server: express.Application | null = null;
  private httpServer: any = null;

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

  async work<T>(
    jobName: string,
    handler: (job: Job<T>) => Promise<void>,
  ): Promise<void> {
    await this.queue.work(jobName, async (job: Job<T>) => {
      try {
        return await handler(job);
      } catch (error) {
        this.logger.error(error);
        console.log('Error!');
        throw error;
      }
    });
  }

  private async healthCheck(): Promise<void> {
    // Basic health check that verifies the queue is connected
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }
  }

  async start(): Promise<void> {
    // Start the queue
    await Queue.start();

    // Create and start the Express server
    this.server = express();

    // Add health check endpoint
    this.server.get(
      '/health',
      healthCheckAPI(this.options.healthCheck, this.logger),
    );

    this.httpServer = this.server.listen(this.options.port);
  }

  async stop(): Promise<void> {
    // Stop the queue
    await Queue.stop();

    // Stop the Express server if it exists
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer.close((err: Error | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.httpServer = null;
      this.server = null;
    }
  }
}
