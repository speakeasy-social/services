import {
  Notification,
  EncryptedPost,
} from '../generated/prisma-client/index.js';
import { createListView } from '@speakeasy-services/common';
import {
  EncryptedPostView,
  toEncryptedPostView,
} from './private-posts.views.js';

export type NotificationView = {
  userDid: string;
  authorDid: string;
  reason: string;
  reasonSubject: string;
  readAt: string | null;
  createdAt: string;
  post: EncryptedPostView | null;
};

type NotificationSubset = Pick<
  Notification,
  'userDid' | 'authorDid' | 'reason' | 'reasonSubject' | 'readAt' | 'createdAt'
> & {
  post?: (EncryptedPost & { _count: { reactions: number } }) | null;
};

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
    post: notification.post ? toEncryptedPostView(notification.post) : null,
  };
}

/**
 * Create a list view that maps over the array
 */
export const toNotificationListView = createListView<
  NotificationSubset,
  NotificationView
>(toNotificationView);
