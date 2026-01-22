import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import { Session, SessionKey } from '../generated/prisma-client/index.js';

/**
 * Session service for private-sessions, using the shared SessionService.
 *
 * Note: The double cast (as unknown as SessionPrismaClient) is required because
 * SessionPrismaClient expects `session` and `sessionKey` property names, which
 * this service's Prisma client provides. The cast ensures type compatibility
 * with the generic interface while maintaining runtime correctness.
 *
 * See spkeasy-xve for investigation details on alternative approaches.
 */
export class SessionService extends SharedSessionService<Session, SessionKey> {
  constructor() {
    super(
      getPrismaClient() as unknown as SessionPrismaClient<Session, SessionKey>,
      'private-sessions',
    );
  }
}
