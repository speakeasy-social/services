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
import {
  type PopulateDidCacheJob,
  type NotifyReactionJob,
  type NotifyReplyJob,
  type DeleteMediaJob,
  createPopulateDidCacheHandler,
  createNotifyReactionHandler,
  createNotifyReplyHandler,
  createDeleteMediaHandler,
} from './handlers/index.js';

const SERVICE_NAME = 'private-sessions';

const worker = new Worker({
  name: 'private-sessions-worker',
  healthCheck,
  port: 4001,
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
    logger: worker.logger,
  }),
);

worker.queue.work<DeleteSessionKeysJob>(
  getServiceJobName(SERVICE_NAME, JOB_NAMES.DELETE_SESSION_KEYS),
  createDeleteSessionKeysHandler(prisma as any, { serviceName: SERVICE_NAME }),
);

// Service-specific job handlers
worker.queue.work<PopulateDidCacheJob>(
  JOB_NAMES.POPULATE_DID_CACHE,
  createPopulateDidCacheHandler(prisma),
);

worker.queue.work<NotifyReactionJob>(
  JOB_NAMES.NOTIFY_REACTION,
  createNotifyReactionHandler(prisma),
);

worker.queue.work<NotifyReplyJob>(
  JOB_NAMES.NOTIFY_REPLY,
  createNotifyReplyHandler(prisma),
);

worker.queue.work<DeleteMediaJob>(
  JOB_NAMES.DELETE_MEDIA,
  createDeleteMediaHandler(),
);

worker
  .start()
  .then(() => {
    console.log('Private sessions Worker started');
  })
  .catch((error: Error) => {
    console.error('Failed to start worker:', error);
    throw error;
  });
