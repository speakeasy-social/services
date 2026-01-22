import {
  SessionService as SharedSessionService,
  SessionPrismaClient,
} from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';
import {
  ProfileSession,
  ProfileSessionKey,
} from '../generated/prisma-client/index.js';

/**
 * Session service for private-profiles, using the shared SessionService.
 *
 * Note: The double cast (as unknown as SessionPrismaClient) is required because
 * SessionPrismaClient expects `session` and `sessionKey` property names, but
 * this service's Prisma client uses `profileSession` and `profileSessionKey`
 * (due to model naming in schema.prisma). The structures are compatible at
 * runtime, but TypeScript cannot verify this without the intermediate cast.
 *
 * Alternative: Rename Prisma models to Session/SessionKey with @@map() to keep
 * table names. See spkeasy-xve for investigation details.
 */
export class SessionService extends SharedSessionService<
  ProfileSession,
  ProfileSessionKey
> {
  constructor() {
    super(
      getPrismaClient() as unknown as SessionPrismaClient<
        ProfileSession,
        ProfileSessionKey
      >,
      'private-profiles',
    );
  }
}
