import {
  decodeCursor,
  encodeCursor,
} from '@speakeasy-services/common';
import { getPrismaClient } from '../db.js';
import {
  Notification,
  EncryptedPost,
} from '../generated/prisma-client/index.js';

const prisma = getPrismaClient();

/**
 * Creates a cursor-based where clause that uses notifiedAt instead of createdAt.
 * Notifications are ordered by notifiedAt (when they became visible) rather than
 * createdAt (when the underlying reply was made).
 */
function createNotificationCursorWhereClause(cursor: string | undefined) {
  if (!cursor) {
    return {};
  }

  // The cursor encodes a timestamp and id. We reuse the standard decoder
  // but apply the decoded timestamp to notifiedAt instead of createdAt.
  const { createdAt: notifiedAt, id } = decodeCursor(cursor);
  return {
    OR: [
      { notifiedAt: { lt: notifiedAt } },
      {
        AND: [{ notifiedAt }, { id: { lt: id } }],
      },
    ],
  };
}

export class NotificationService {
  /**
   * Gets the count of unread notifications for a user.
   * Only counts non-pending (visible) notifications.
   */
  async getUnreadCount(did: string): Promise<number> {
    const count = await prisma.notification.count({
      where: {
        userDid: did,
        pending: false,
        readAt: null,
      },
    });

    return count;
  }

  /**
   * Gets a paginated list of notifications for a user.
   * By default only returns non-pending (visible) notifications,
   * ordered by notifiedAt (when the notification became visible).
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
    priority?: boolean;
  }): Promise<{
    notifications: (Notification & {
      post?: (EncryptedPost & { _count: { reactions: number } }) | null;
    })[];
    cursor: string | null;
  }> {
    const notifications = await prisma.notification.findMany({
      where: {
        userDid: did,
        // The priority param controls pending filtering:
        // - undefined/true: show only non-pending (default)
        // - false: show all including pending
        pending: priority === false ? undefined : false,
        ...createNotificationCursorWhereClause(cursor),
      },
      take: limit,
      orderBy: [
        { notifiedAt: 'desc' },
        { id: 'asc' }, // Secondary sort for stable pagination
      ],
    });

    // Encode cursor using notifiedAt as the timestamp
    const nextCursor =
      notifications.length === limit
        ? encodeCursor({
            createdAt: notifications[notifications.length - 1].notifiedAt,
            id: notifications[notifications.length - 1].id,
          })
        : null;

    return {
      notifications,
      cursor: nextCursor,
    };
  }

  /**
   * Marks non-pending notifications as read for a user up to a specific timestamp.
   * Uses notifiedAt for comparison so that pending notifications that are later
   * activated won't be incorrectly marked as already seen.
   */
  async updateSeen(did: string, seenAt: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        userDid: did,
        pending: false,
        readAt: null,
        notifiedAt: {
          lte: new Date(seenAt),
        },
      },
      data: {
        readAt: new Date(seenAt),
      },
    });
  }
}
