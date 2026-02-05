import {
  createDeleteSessionKeysHandler as createSharedHandler,
  type SessionPrismaClient,
  type DeleteSessionKeysOptions,
} from '@speakeasy-services/session-management';
import type { PrismaClient } from '../generated/prisma-client/index.js';

export function createDeleteSessionKeysHandler(
  prisma: PrismaClient,
  options: DeleteSessionKeysOptions,
) {
  return createSharedHandler(
    prisma as unknown as SessionPrismaClient,
    options,
  );
}
