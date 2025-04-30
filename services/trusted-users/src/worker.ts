import { Worker } from '@speakeasy-services/service-base';
import { healthCheck } from './health.js';

interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
}

// No work to do right now
// const worker = new Worker({
//   name: 'trusted-users-worker',
//   healthCheck,
//   port: parseInt(process.env.PORT || '4002'),
// });

// worker.start().catch((error: Error) => {
//   console.error('Failed to start worker:', error);
//   throw error;
// });
