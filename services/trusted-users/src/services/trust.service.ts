import {
  PrismaClient,
  Prisma,
  TrustedUser,
} from '../generated/prisma-client/index.js';
import { NotFoundError, RateLimitError } from '@speakeasy-services/common';
import { Queue, JOB_NAMES } from '@speakeasy-services/queue';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

const DEFER_BULK_ADD_TRUSTED_SECONDS = 2 * 60;
const MAX_TRUSTED_USERS_PER_DAY = 10;

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
   * Gets all trusted users for an author
   */
  async getTrustedCount(authorDid: string): Promise<number> {
    return prisma.trustedUser.count({
      where: {
        authorDid,
        deletedAt: null,
      },
    });
  }

  /**
   * Adds a new trusted user and schedules session update
   */
  async bulkAddTrusted(
    authorDid: string,
    recipientDids: string[],
  ): Promise<string[]> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Use raw SQL to lock records for update
      const existingRecipients = await tx.$queryRaw<TrustedUser[]>(
        Prisma.sql`SELECT "recipientDid" FROM trusted_users WHERE "authorDid" = ${authorDid} AND "recipientDid" IN (${Prisma.join(recipientDids)}) FOR UPDATE`,
      );

      const existingRecipientDids = new Set(
        existingRecipients.map((r) => r.recipientDid),
      );

      const newRecipientDids = recipientDids.filter(
        (did) => !existingRecipientDids.has(did),
      );

      if (newRecipientDids.length === 0) {
        return [];
      }

      if (
        existingRecipients.length + newRecipientDids.length >
        MAX_TRUSTED_USERS_PER_DAY
      ) {
        throw new RateLimitError('Daily trust limit exceeded', {
          max: MAX_TRUSTED_USERS_PER_DAY,
        });
      }

      await tx.trustedUser.createMany({
        data: newRecipientDids.map((recipientDid) => ({
          authorDid,
          recipientDid,
          createdAt: new Date(),
        })),
      });

      await Queue.bulkPublish(
        {
          name: JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
          startAfter: new Date(
            Date.now() + DEFER_BULK_ADD_TRUSTED_SECONDS * 1000,
          ),
        },
        newRecipientDids.map((recipientDid) => ({
          authorDid,
          recipientDid,
        })),
      );

      return newRecipientDids;
    });
  }

  /**
   * Adds a new trusted user and schedules session update
   */
  async addTrusted(authorDid: string, recipientDid: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create trust relationship - we can rely on the unique constraint to prevent duplicates
      await prisma.trustedUser.create({
        data: {
          authorDid,
          recipientDid,
          createdAt: new Date(),
        },
      });

      const existing = await tx.trustedUser.count({
        where: {
          authorDid,
          createdAt: {
            // 24 hours ago
            gt: new Date(Date.now() - 1000 * 60 * 60 * 24),
          },
        },
      });

      if (existing + 1 >= MAX_TRUSTED_USERS_PER_DAY) {
        throw new RateLimitError('You may not add more users today');
      }

      await Queue.publish(JOB_NAMES.ADD_RECIPIENT_TO_SESSION, {
        authorDid,
        recipientDid,
      });
    });
  }

  /**
   * Removes a trusted user and schedules session rotation
   */
  async removeTrusted(authorDid: string, recipientDid: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Try to update the relationship to mark it as deleted
      const result = await tx.trustedUser.deleteMany({
        where: {
          authorDid,
          recipientDid,
        },
      });

      if (result.count === 0) {
        throw new NotFoundError('Trust relationship does not exist');
      }
    });

    await Queue.publish(JOB_NAMES.REVOKE_SESSION, {
      authorDid,
      recipientDid,
    });
  }

  async bulkRemoveTrusted(
    authorDid: string,
    recipientDids: string[],
  ): Promise<string[]> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Use raw SQL to lock records for update
      const existingRecipients = await tx.$queryRaw<TrustedUser[]>(
        Prisma.sql`SELECT recipientDid FROM trusted_users WHERE "authorDid" = ${authorDid} AND "recipientDid" IN (${Prisma.join(recipientDids)}) FOR UPDATE`,
      );

      const existingRecipientDids = new Set(
        existingRecipients.map((r) => r.recipientDid),
      );

      const removedRecipientDids = recipientDids.filter((did) =>
        existingRecipientDids.has(did),
      );

      if (removedRecipientDids.length === 0) {
        return [];
      }

      await tx.trustedUser.deleteMany({
        where: {
          authorDid,
          recipientDid: { in: removedRecipientDids },
        },
      });

      await Queue.publish(JOB_NAMES.REVOKE_SESSION, { authorDid });

      await Queue.bulkPublish(
        {
          name: JOB_NAMES.DELETE_SESSION_KEYS,
          startAfter: new Date(
            Date.now() + DEFER_BULK_ADD_TRUSTED_SECONDS * 1000,
          ),
        },
        removedRecipientDids.map((recipientDid) => ({
          authorDid,
          recipientDid,
        })),
      );

      return removedRecipientDids;
    });
  }
}
