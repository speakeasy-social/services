import { NotificationService } from '../services/notification.service.js';
import {
  authorize,
  RequestHandler,
  RequestHandlerReturn,
  ExtendedRequest,
  validateAgainstLexicon,
  User,
} from '@speakeasy-services/common';
import { toNotificationListView } from '../views/notification.views.js';
import {
  listNotificationsDef,
  updateSeenDef,
} from '../lexicon/types/notifications.js';

const notificationService = new NotificationService();

// Define method handlers with lexicon validation
const methodHandlers = {
  'social.spkeasy.notification.getUnreadCount': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = (req.user as User)!.did!;

    authorize(req, 'list', 'notification', { userDid: did });

    const unreadCount = await notificationService.getUnreadCount(did);

    return {
      body: { count: unreadCount },
    };
  },
  'social.spkeasy.notification.listNotifications': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    const did = (req.user as User)!.did!;

    // Validate input against lexicon
    validateAgainstLexicon(listNotificationsDef, req.query);

    const { cursor, limit, priority } = req.query;

    const { notifications, cursor: newCursor } =
      await notificationService.getNotifications({
        did,
        cursor: cursor as string,
        limit: limit ? parseInt(limit as string) : undefined,
        priority: priority as string,
      });

    authorize(req, 'list', 'notification', notifications);

    return {
      body: {
        notifications: toNotificationListView(notifications),
        cursor: newCursor,
      },
    };
  },
  'social.spkeasy.notification.updateSeen': async (
    req: ExtendedRequest,
  ): RequestHandlerReturn => {
    // Validate input against lexicon
    validateAgainstLexicon(updateSeenDef, req.body);

    const did = (req.user as User)!.did!;

    const { seenAt } = req.body;

    authorize(req, 'update', 'notification', { userDid: did });

    await notificationService.updateSeen(did, seenAt);

    return {
      body: { status: 'success' },
    };
  },
} as const;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  // Session management methods
  'social.spkeasy.notification.getUnreadCount': {
    handler: methodHandlers['social.spkeasy.notification.getUnreadCount'],
  },
  // Session management methods
  'social.spkeasy.notification.listNotifications': {
    handler: methodHandlers['social.spkeasy.notification.listNotifications'],
  },
  // Session management methods
  'social.spkeasy.notification.updateSeen': {
    handler: methodHandlers['social.spkeasy.notification.updateSeen'],
  },
};

type MethodName = keyof typeof methodHandlers;
