import { v4 as uuidv4 } from 'uuid';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import { Prisma } from '../generated/prisma-client/index.js';
import type { NotifyReactionJob } from './types.js';

export function createNotifyReactionHandler(prisma: PrismaClient) {
  return async (job: { data: NotifyReactionJob }) => {
    const userDid = job.data.uri.split('/')[2];

    if (userDid === job.data.authorDid) {
      return;
    }

    try {
      await prisma.notification.create({
        data: {
          id: uuidv4(),
          userDid,
          authorDid: job.data.authorDid,
          reason: 'like',
          reasonSubject: job.data.uri,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Silently ignore unique constraint violations
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  };
}
