import { LexiconDoc } from '@atproto/lexicon';

// Single consolidated session lexicon that covers all session operations
export const sessionLexicon: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.session',
  defs: {
    // Create session operation
    create: {
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
                type: 'ref',
                ref: '#sessionKey',
              },
            },
            expirationHours: { type: 'integer' },
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

    // Revoke session operation
    revoke: {
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

    // Get session operation
    getSession: {
      type: 'query',
      description: 'Get the current session for the authenticated user',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['encryptedSessionKey'],
          properties: {
            encryptedSessionKey: {
              type: 'ref',
              ref: '#sessionKeyView',
            },
          },
        },
      },
    },

    // Add user to session operation
    addUser: {
      type: 'procedure',
      description: 'Add a new recipient to an existing session',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['recipientDid', 'encryptedDek', 'userKeyPairId'],
          properties: {
            recipientDid: { type: 'string' },
            encryptedDek: { type: 'string' },
            userKeyPairId: { type: 'string' },
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

    // Update session keys operation
    updateKeys: {
      type: 'procedure',
      description: 'Update the session keys for a session',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['prevKeyId', 'newKeyId', 'prevPrivateKey', 'newPublicKey'],
          properties: {
            prevKeyId: { type: 'string' },
            newKeyId: { type: 'string' },
            prevPrivateKey: { type: 'string' },
            newPublicKey: { type: 'string' },
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

    // Common session key definition
    sessionKey: {
      type: 'object',
      required: ['recipientDid', 'encryptedDek'],
      properties: {
        recipientDid: { type: 'string' },
        userKeyPairId: { type: 'string' },
        encryptedDek: { type: 'string' },
      },
    },

    // Session key view for responses
    sessionKeyView: {
      type: 'object',
      required: ['recipientDid', 'encryptedDek'],
      properties: {
        recipientDid: { type: 'string' },
        userKeyPairId: { type: 'string' },
        encryptedDek: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  },
};

// Helper function to get specific operation definitions
export function getSessionOperation(
  operation: 'create' | 'revoke' | 'getSession' | 'addUser' | 'updateKeys',
) {
  return {
    lexicon: 1,
    id: `social.spkeasy.session.${operation}`,
    defs: {
      main: sessionLexicon.defs[operation],
      ...sessionLexicon.defs,
    },
  } as LexiconDoc;
}

// Legacy function for backward compatibility
export function createSessionLexicons(prefix: string) {
  const lexicons: Record<string, LexiconDoc> = {};

  const operations = [
    'create',
    'revoke',
    'getSession',
    'addUser',
    'updateKeys',
  ] as const;

  for (const operation of operations) {
    lexicons[`${prefix}.${operation}`] = getSessionOperation(operation);
  }

  return lexicons;
}
