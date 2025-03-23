import { Worker } from '@speakeasy-services/service-base';
import { DatabaseError } from '@speakeasy-services/common/errors.js';

const worker = new Worker();

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw new DatabaseError('Failed to start worker');
});
