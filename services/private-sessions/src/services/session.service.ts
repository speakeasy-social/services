import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import { Session, SessionKey } from '../generated/prisma-client/index.js';

// Create a new instance of the shared session service with our Prisma client
export class SessionService extends SharedSessionService<Session, SessionKey> {
  constructor() {
    // Cast the Prisma client to the expected interface and pass service name
    super(
      getPrismaClient() as SessionPrismaClient<Session, SessionKey>,
      'private-sessions',
    );
  }
}
