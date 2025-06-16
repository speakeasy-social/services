import { SessionService as SharedSessionService } from '@speakeasy-services/session-management';
import { getPrismaClient } from '../db.js';

// Create a new instance of the shared session service with our Prisma client
export class SessionService extends SharedSessionService {
  constructor() {
    super(getPrismaClient());
  }
}
