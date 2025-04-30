import { PrismaClient } from '../generated/prisma-client/index.js';
import {
  createCursorWhereClause,
  encodeCursor,
} from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';

const prisma = getPrismaClient();

export class NotificationService {
  /**
   * Gets the count of unread notifications for a user
   * @param did - The DID of the user to get unread count for
   * @returns The number of unread notifications
   */
  async getUnreadCount(did: string): Promise<number> {
    const count = await prisma.notification.count({
      where: {
        userDid: did,
        readAt: null,
      },
    });

    return count;
  }

  /**
   * Gets a paginated list of notifications for a user
   * @param did - The DID of the user to get notifications for
   * @param cursor - Optional cursor for pagination
   * @param limit - Maximum number of notifications to return (default: 50)
   * @param priority - Optional priority filter for notifications
   * @returns Object containing the notifications array and next cursor for pagination
   */
  async getNotifications({
    did,
    cursor,
    limit = 50,
    priority,
  }: {
    did: string;
    cursor?: string;
    limit?: number;
    priority?: string;
  }): Promise<{ notifications: any[]; cursor: string | null }> {
    const notifications = await prisma.notification.findMany({
      where: {
        userDid: did,
        ...(priority ? { priority } : {}),
        ...createCursorWhereClause(cursor),
      },
      take: limit,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'asc' }, // Secondary sort for stable pagination
      ],
    });

    // Only create a cursor if we got exactly the limit number of items
    // This indicates there might be more results
    const nextCursor =
      notifications.length === limit
        ? encodeCursor(notifications[notifications.length - 1])
        : null;

    return {
      notifications,
      cursor: nextCursor,
    };
  }

  /**
   * Marks notifications as read for a user up to a specific timestamp
   * @param did - The DID of the user whose notifications to mark as read
   * @param seenAt - The timestamp to mark notifications as read up to
   */
  async updateSeen(did: string, seenAt: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        userDid: did,
        readAt: null,
        createdAt: {
          lte: new Date(seenAt),
        },
      },
      data: {
        readAt: new Date(seenAt),
      },
    });
  }
}
