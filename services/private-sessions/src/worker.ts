import { Worker } from '@speakeasy-services/service-base';
import { DatabaseError } from '@speakeasy-services/common';

const worker = new Worker();

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
