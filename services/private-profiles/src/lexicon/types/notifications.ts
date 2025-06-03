import { LexiconDoc } from '@atproto/lexicon';

export const getUnreadCountDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.notification.getUnreadCount',
  defs: {
    main: {
      type: 'query',
      description: 'Get the count of unread notifications for the current user',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['count'],
          properties: {
            count: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const listNotificationsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.notification.listNotifications',
  defs: {
    main: {
      type: 'query',
      description: 'List notifications for the current user',
      parameters: {
        type: 'params',
        required: [],
        properties: {
          cursor: {
            type: 'string',
            description: 'Optional cursor for pagination',
          },
          limit: {
            type: 'integer',
            description: 'Optional limit for pagination',
          },
          priority: {
            type: 'boolean',
            description: 'Optional filter by notification priority',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['notifications'],
          properties: {
            notifications: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#notification',
              },
            },
            cursor: { type: 'string' },
          },
        },
      },
    },
    notification: {
      type: 'object',
      properties: {
        userDid: { type: 'string' },
        authorDid: { type: 'string' },
        reason: { type: 'string' },
        reasonSubject: { type: 'string' },
        readAt: { type: 'string', format: 'datetime' },
        createdAt: { type: 'string', format: 'datetime' },
      },
    },
  },
};

export const updateSeenDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.notification.updateSeen',
  defs: {
    main: {
      type: 'procedure',
      description: 'Update the seen timestamp for notifications',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['seenAt'],
          properties: {
            seenAt: { type: 'string', format: 'datetime' },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string' },
          },
        },
      },
    },
  },
};
