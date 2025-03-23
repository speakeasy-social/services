import { Queue } from '@speakeasy-services/queue';

export class Worker {
  private queue: Queue;

  constructor() {
    this.queue = Queue.getInstance();
  }

  async start(): Promise<void> {
    await Queue.start();
  }

  async stop(): Promise<void> {
    await Queue.stop();
  }
}
