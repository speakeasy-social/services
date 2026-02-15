import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';
import {
  type AddRecipientToSessionJob,
  type RevokeSessionJob,
  type DeleteSessionKeysJob,
  type UpdateSessionKeysJob,
  type PopulateDidCacheJob,
  type NotifyReactionJob,
  type NotifyReplyJob,
  type DeleteMediaJob,
  createAddRecipientToSessionHandler,
  createRevokeSessionHandler,
  createDeleteSessionKeysHandler,
  createUpdateSessionKeysHandler,
  createPopulateDidCacheHandler,
  createNotifyReactionHandler,
  createNotifyReplyHandler,
  createDeleteMediaHandler,
} from './handlers/index.js';

const worker = new Worker({
  name: 'private-sessions-worker',
  healthCheck,
  port: 4001,
});

const prisma = getPrismaClient();

// Register all job handlers
worker.work<AddRecipientToSessionJob>(
  JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
  createAddRecipientToSessionHandler(prisma, { serviceName: 'private-sessions' }),
);

worker.queue.work<RevokeSessionJob>(
  JOB_NAMES.REVOKE_SESSION,
  createRevokeSessionHandler(prisma),
);

worker.queue.work<DeleteSessionKeysJob>(
  JOB_NAMES.DELETE_SESSION_KEYS,
  createDeleteSessionKeysHandler(prisma, { serviceName: 'private-sessions' }),
);

worker.queue.work<UpdateSessionKeysJob>(
  JOB_NAMES.UPDATE_SESSION_KEYS,
  createUpdateSessionKeysHandler(prisma),
);

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
