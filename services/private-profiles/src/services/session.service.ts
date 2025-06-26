import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import {
  ProfileSession,
  ProfileSessionKey,
} from '../generated/prisma-client/index.js';

// Create a new instance of the shared session service with our Prisma client
export class SessionService extends SharedSessionService<
  ProfileSession,
  ProfileSessionKey
> {
  constructor() {
    // Cast the Prisma client to the expected interface and pass service name
    super(
      getPrismaClient() as SessionPrismaClient<
        ProfileSession,
        ProfileSessionKey
      >,
      'private-profiles',
    );
  }
}
