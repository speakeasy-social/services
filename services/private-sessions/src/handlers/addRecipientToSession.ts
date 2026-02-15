import {
  createAddRecipientToSessionHandler as createSharedHandler,
  type SessionPrismaClient,
  type AddRecipientToSessionOptions,
} from '@speakeasy-services/session-management';
import type { PrismaClient } from '../generated/prisma-client/index.js';

export function createAddRecipientToSessionHandler(
  prisma: PrismaClient,
  options: AddRecipientToSessionOptions,
) {
  return createSharedHandler(
    prisma as unknown as SessionPrismaClient,
    options,
  );
}
