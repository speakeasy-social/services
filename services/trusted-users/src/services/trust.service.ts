import {
  PrismaClient,
  Prisma,
  TrustedUser,
} from '../generated/prisma-client/index.js';
import { NotFoundError, RateLimitError } from '@speakeasy-services/common';
import { Queue, JOB_NAMES, getServiceJobName } from '@speakeasy-services/queue';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

// Wait two minutes before adding the session to go with bulk added trusted
// users in case the user changes their mind and undoes, there's less work
// to do
const DEFER_BULK_ADD_TRUSTED_SECONDS = 2 * 60;
const MAX_TRUSTED_USERS_PER_DAY = 10;

export class TrustService {
  /**
   * Gets all trusted users for an author
   */
  async getTrusted(
    authorDid: string,
    recipientDid?: string,
  ): Promise<TrustedUser[]> {
    const whereClause: any = {
      authorDid,
      deletedAt: null,
    };
    
    if (recipientDid) {
      whereClause.recipientDid = recipientDid;
    }
    
    return prisma.trustedUser.findMany({
      where: whereClause,
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
   * Gets all trusted users for an author
   */
  async getTrustedQuota(authorDid: string): Promise<{
    maxDaily: number;
    remaining: number;
  }> {
    const existing = await prisma.trustedUser.count({
      where: {
        authorDid,
        createdAt: {
          // 24 hours ago
          gt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
      },
    });

    return {
      maxDaily: MAX_TRUSTED_USERS_PER_DAY,
      remaining: MAX_TRUSTED_USERS_PER_DAY - existing,
    };
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
      const lastDayTrustsPromise = tx.trustedUser.count({
        where: {
          authorDid,
          createdAt: {
            gt: new Date(Date.now() - 1000 * 60 * 60 * 24),
          },
        },
      });

      const existingRecipientDids = new Set(
        existingRecipients.map((r) => r.recipientDid),
      );

      const newRecipientDids = recipientDids.filter(
        (did) => !existingRecipientDids.has(did),
      );

      if (newRecipientDids.length === 0) {
        return [];
      }

      const lastDayTrusts = await lastDayTrustsPromise;

      if (lastDayTrusts + newRecipientDids.length > MAX_TRUSTED_USERS_PER_DAY) {
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

      await Queue.bulkPublish(
        {
          name: getServiceJobName(
            'private-profiles',
            JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
          ),
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
      await tx.trustedUser.create({
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

      if (existing >= MAX_TRUSTED_USERS_PER_DAY) {
        throw new RateLimitError('You may not add more users today', {
          max: MAX_TRUSTED_USERS_PER_DAY,
        });
      }

      await Queue.publish(JOB_NAMES.ADD_RECIPIENT_TO_SESSION, {
        authorDid,
        recipientDid,
      });

      await Queue.publish(
        getServiceJobName(
          'private-profiles',
          JOB_NAMES.ADD_RECIPIENT_TO_SESSION,
        ),
        {
          authorDid,
          recipientDid,
        },
      );
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

    await Queue.publish(
      getServiceJobName('private-profiles', JOB_NAMES.REVOKE_SESSION),
      {
        authorDid,
        recipientDid,
      },
    );
  }

  /**
   * Removes multiple users from the trusted users list in a single transaction
   * @param authorDid - The DID of the user removing trusted users
   * @param recipientDids - Array of DIDs to remove from trusted users
   * @returns Promise resolving to array of DIDs that were successfully removed
   */
  async bulkRemoveTrusted(
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

      await Queue.publish(
        getServiceJobName('private-profiles', JOB_NAMES.REVOKE_SESSION),
        { authorDid },
      );

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

      await Queue.bulkPublish(
        {
          name: getServiceJobName(
            'private-profiles',
            JOB_NAMES.DELETE_SESSION_KEYS,
          ),
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
