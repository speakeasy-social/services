import {
  PrismaClient,
  Prisma,
  TrustedUser,
} from '../generated/prisma-client/index.js';
import { NotFoundError } from '@speakeasy-services/common';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';

const prisma = new PrismaClient();

export class TrustService {
  /**
   * Gets all trusted users for an author
   */
  async getTrusted(
    authorDid: string,
    recipientDid: string,
  ): Promise<TrustedUser[]> {
    return prisma.trustedUser.findMany({
      where: {
        authorDid,
        recipientDid,
        deletedAt: null,
      },
    });
  }

  /**
   * Adds a new trusted user and schedules session update
   */
  async addTrusted(authorDid: string, recipientDid: string): Promise<void> {
    // Create trust relationship - we can rely on the unique constraint to prevent duplicates
    await prisma.trustedUser.create({
      data: {
        authorDid,
        recipientDid,
        createdAt: new Date(),
      },
    });

    Queue.publish(JOB_NAMES.ADD_RECIPIENT_TO_SESSION, {
      authorDid,
      recipientDid,
    });
  }

  /**
   * Removes a trusted user and schedules session rotation
   */
  async removeTrusted(authorDid: string, recipientDid: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Try to update the relationship to mark it as deleted
      const result = await tx.trustedUser.updateMany({
        where: {
          authorDid,
          recipientDid,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new NotFoundError('Trust relationship does not exist');
      }
    });

    Queue.publish(JOB_NAMES.REVOKE_SESSION, {
      authorDid,
      recipientDid,
    });
  }
}
