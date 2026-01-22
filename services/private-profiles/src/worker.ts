import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES, getServiceJobName } from '@speakeasy-services/queue';
import {
  createUpdateSessionKeysHandler,
  createRevokeSessionHandler,
  createAddRecipientToSessionHandler,
  createDeleteSessionKeysHandler,
  type UpdateSessionKeysJob,
  type RevokeSessionJob,
  type AddRecipientToSessionJob,
  type DeleteSessionKeysJob,
} from '@speakeasy-services/session-management';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';

const SERVICE_NAME = 'private-profiles';

const worker = new Worker({
  name: 'private-profiles-worker',
  healthCheck,
  port: 4005,
});

const prisma = getPrismaClient();

// Session management job handlers (from shared package)
// Note: trusted-users publishes jobs with service-prefixed names
worker.queue.work<UpdateSessionKeysJob>(
  getServiceJobName(SERVICE_NAME, JOB_NAMES.UPDATE_SESSION_KEYS),
  createUpdateSessionKeysHandler(prisma as any),
);

worker.queue.work<RevokeSessionJob>(
  getServiceJobName(SERVICE_NAME, JOB_NAMES.REVOKE_SESSION),
  createRevokeSessionHandler(prisma as any),
);

worker.queue.work<AddRecipientToSessionJob>(
  getServiceJobName(SERVICE_NAME, JOB_NAMES.ADD_RECIPIENT_TO_SESSION),
  createAddRecipientToSessionHandler(prisma as any, {
    serviceName: SERVICE_NAME,
    // Profiles are not historical - there's only one current profile. When adding
    // trusted followers, we only need to grant access to the current session.
    currentSessionOnly: true,
    logger: worker.logger,
  }),
);

worker.queue.work<DeleteSessionKeysJob>(
  getServiceJobName(SERVICE_NAME, JOB_NAMES.DELETE_SESSION_KEYS),
  createDeleteSessionKeysHandler(prisma as any, { serviceName: SERVICE_NAME }),
);

worker.start();
