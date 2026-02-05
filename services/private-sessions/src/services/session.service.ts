import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import { Session, SessionKey } from '../generated/prisma-client/index.js';

// Create a new instance of the shared session service with our Prisma client
export class SessionService extends SharedSessionService<Session, SessionKey> {
  constructor() {
    // Use the Prisma client directly - the interface is now flexible enough
    super(
      getPrismaClient() as unknown as SessionPrismaClient<Session, SessionKey>,
      'private-sessions',
    );
  }
}
