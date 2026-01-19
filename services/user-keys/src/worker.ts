import { Worker } from '@speakeasy-services/service-base';
import { JOB_NAMES } from '@speakeasy-services/queue';
import { PrismaClient } from './generated/prisma-client/index.js';
import { healthCheck } from './health.js';
import {
  type UpdateUserKeysJob,
  createUpdateUserKeysHandler,
} from './handlers/index.js';

const worker = new Worker({
  name: 'user-keys-worker',
  healthCheck,
  port: 4000,
});
const prisma = new PrismaClient();

// Register job handlers
worker.work<UpdateUserKeysJob>(
  JOB_NAMES.UPDATE_USER_KEYS,
  createUpdateUserKeysHandler(prisma),
);

worker.start().catch((error: Error) => {
  console.error('Failed to start worker:', error);
  throw error;
});
