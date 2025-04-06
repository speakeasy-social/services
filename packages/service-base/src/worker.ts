import { Queue, QueueConfig } from '@speakeasy-services/queue';

export interface WorkerOptions {
  name: string;
  queueConfig?: QueueConfig;
}

export class Worker {
  private queue: Queue;
  private options: WorkerOptions;

  constructor(options: WorkerOptions) {
    this.options = options;
    this.queue = Queue.getInstance({
      connectionString: process.env.DATABASE_URL!,
      schema: process.env.PGBOSS_SCHEMA || 'pgboss'
    });
  }

  async start(): Promise<void> {
    await Queue.start();
  }

  async stop(): Promise<void> {
    await Queue.stop();
  }
}
