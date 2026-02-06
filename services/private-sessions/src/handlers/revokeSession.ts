import {
  createRevokeSessionHandler as createSharedHandler,
  type SessionPrismaClient,
} from '@speakeasy-services/session-management';
import type { PrismaClient } from '../generated/prisma-client/index.js';

export function createRevokeSessionHandler(prisma: PrismaClient) {
  return createSharedHandler(prisma as unknown as SessionPrismaClient);
}
