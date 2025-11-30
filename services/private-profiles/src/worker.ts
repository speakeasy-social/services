import { Worker } from '@speakeasy-services/service-base';
import { SessionJobHandlers } from '@speakeasy-services/session-management';
import { healthCheck } from './health.js';
import { getPrismaClient } from './db.js';

const worker = new Worker({
  name: 'private-profiles-worker',
  healthCheck,
  port: 4005,
});

const prisma = getPrismaClient();

// Attach shared session management job handlers
const sessionHandlers = new SessionJobHandlers(prisma as any, 'private-profiles');
sessionHandlers.attachToWorker(worker);

worker.start();
