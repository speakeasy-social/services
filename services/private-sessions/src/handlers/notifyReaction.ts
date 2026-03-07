import { v4 as uuidv4 } from 'uuid';
import type { PrismaClient } from '../generated/prisma-client/index.js';
import { Prisma } from '../generated/prisma-client/index.js';
import type { NotifyReactionJob } from './types.js';

export function createNotifyReactionHandler(prisma: PrismaClient) {
  return async (job: { data: NotifyReactionJob }) => {
    const { uri, authorDid } = job.data;
    const userDid = uri.split('/')[2];

    if (userDid === authorDid) {
      return;
    }

    try {
      await prisma.notification.create({
        data: {
          id: uuidv4(),
          userDid,
          authorDid,
          reason: 'like',
          reasonSubject: uri,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Silently ignore unique constraint violations
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Continue to check activation of pending reply notifications
      } else {
        throw error;
      }
    }

    // When a post reaches 2+ likes, activate any pending reply notifications.
    // This handles the case where a reply was from an untrusted/unfollowed user
    // but has now been validated by community engagement.
    const reactionCount = await prisma.reaction.count({
      where: { uri },
    });

    if (reactionCount >= 2) {
      const now = new Date();
      await prisma.notification.updateMany({
        where: {
          reasonSubject: uri,
          reason: 'reply',
          pending: true,
        },
        data: {
          pending: false,
          readAt: null,
          notifiedAt: now,
          updatedAt: now,
        },
      });
    }
  };
}
