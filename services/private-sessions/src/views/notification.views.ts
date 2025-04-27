import { Notification } from '../generated/prisma-client/index.js';
import { createListView } from '@speakeasy-services/common';

export type NotificationView = {
  userDid: string;
  authorDid: string;
  reason: string;
  reasonSubject: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationSubset = Pick<
  Notification,
  'userDid' | 'authorDid' | 'reason' | 'reasonSubject' | 'readAt' | 'createdAt'
>;

export function toNotificationView(
  notification: NotificationSubset,
): NotificationView {
  return {
    userDid: notification.userDid,
    authorDid: notification.authorDid,
    reason: notification.reason,
    reasonSubject: notification.reasonSubject,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

/**
 * Create a list view that maps over the array
 */
export const toNotificationListView = createListView<
  NotificationSubset,
  NotificationView
>(toNotificationView);
