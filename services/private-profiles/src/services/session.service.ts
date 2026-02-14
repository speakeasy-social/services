import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import { Session, SessionKey } from '../generated/prisma-client/index.js';

// Create a new instance of the shared session service with our Prisma client
export class SessionService extends SharedSessionService<Session, SessionKey> {
  constructor() {
    super(
      getPrismaClient() as unknown as SessionPrismaClient<Session, SessionKey>,
      'private-profiles',
      { sessionTableName: 'profile_sessions' },
    );
  }
}
