import { Lexicons } from '@atproto/lexicon';

export const sessionLexicons = {
  create: {
    lexicon: 1,
    id: 'create',
    type: 'procedure',
    description: 'Create a new session with the specified session keys',
    input: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['sessionKeys'],
        properties: {
          sessionKeys: {
            type: 'array',
            items: {
              type: 'object',
              required: ['recipientDid', 'encryptedSessionKey'],
              properties: {
                recipientDid: { type: 'string' },
                encryptedSessionKey: { type: 'string' },
              },
            },
          },
          expirationHours: { type: 'number' },
        },
      },
    },
    output: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  },

  revoke: {
    lexicon: 1,
    id: 'revoke',
    type: 'procedure',
    description: 'Revoke an existing session',
    input: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['authorDid'],
        properties: {
          authorDid: { type: 'string' },
        },
      },
    },
    output: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean' },
        },
      },
    },
  },

  getSession: {
    lexicon: 1,
    id: 'getSession',
    type: 'query',
    description: 'Get the current session for the authenticated user',
    output: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['encryptedSessionKey'],
        properties: {
          encryptedSessionKey: {
            type: 'object',
            required: ['recipientDid', 'encryptedSessionKey'],
            properties: {
              recipientDid: { type: 'string' },
              encryptedSessionKey: { type: 'string' },
            },
          },
        },
      },
    },
  },

  addUser: {
    lexicon: 1,
    id: 'addUser',
    type: 'procedure',
    description: 'Add a new recipient to an existing session',
    input: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['recipientDid', 'encryptedSessionKey'],
        properties: {
          recipientDid: { type: 'string' },
          encryptedSessionKey: { type: 'string' },
        },
      },
    },
    output: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean' },
        },
      },
    },
  },

  updateKeys: {
    lexicon: 1,
    id: 'updateKeys',
    type: 'procedure',
    description: 'Update the session keys for a session',
    input: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['recipients'],
        properties: {
          recipients: {
            type: 'array',
            items: {
              type: 'object',
              required: ['recipientDid', 'encryptedSessionKey'],
              properties: {
                recipientDid: { type: 'string' },
                encryptedSessionKey: { type: 'string' },
              },
            },
          },
        },
      },
    },
    output: {
      encoding: 'application/json',
      schema: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean' },
        },
      },
    },
  },
} as const;

export function createSessionLexicons(prefix: string): Lexicons {
  const lexicons: Lexicons = {};

  for (const [key, value] of Object.entries(sessionLexicons)) {
    lexicons[`${prefix}.${key}`] = value;
  }

  return lexicons;
}
