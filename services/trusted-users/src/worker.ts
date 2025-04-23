import { Worker } from '@speakeasy-services/service-base';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
import { speakeasyApiRequest } from '@speakeasy-services/common';

interface AddRecipientToSessionJob {
  authorDid: string;
  recipientDid: string;
}

interface RotateSessionJob {
  authorDid: string;
}

const worker = new Worker({ name: 'trusted-users-worker' });

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
