import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES, getServiceJobName } from '@speakeasy-services/queue';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';
import {
  type AddRecipientToSessionJob,
  type RevokeSessionJob,
  type DeleteSessionKeysJob,
  createAddRecipientToSessionHandler,
  createRevokeSessionHandler,
  createDeleteSessionKeysHandler,
} from './handlers/index.js';

const worker = new Worker({
  name: 'private-profiles-worker',
  healthCheck,
  port: 4003,
});

const prisma = getPrismaClient();

worker.work<AddRecipientToSessionJob>(
  getServiceJobName('private-profiles', JOB_NAMES.ADD_RECIPIENT_TO_SESSION),
  createAddRecipientToSessionHandler(prisma, {
    serviceName: 'private-profiles',
    currentSessionOnly: true,
  }),
);

worker.work<RevokeSessionJob>(
  getServiceJobName('private-profiles', JOB_NAMES.REVOKE_SESSION),
  createRevokeSessionHandler(prisma),
);

worker.work<DeleteSessionKeysJob>(
  getServiceJobName('private-profiles', JOB_NAMES.DELETE_SESSION_KEYS),
  createDeleteSessionKeysHandler(prisma, {
    serviceName: 'private-profiles',
  }),
);

worker
  .start()
  .then(() => {
    console.log('Private profiles Worker started');
  })
  .catch((error: Error) => {
    console.error('Failed to start worker:', error);
    throw error;
  });
