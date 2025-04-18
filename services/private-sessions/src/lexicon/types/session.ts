import { LexiconDoc } from '@atproto/lexicon';

export const revokeSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privateSession.revoke',
  defs: {
    main: {
      type: 'procedure',
      description: 'Revoke a private session',
      parameters: {
        type: 'params',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
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
  },
};

export const addUserDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privateSession.addUser',
  defs: {
    main: {
      type: 'procedure',
      description: 'Add a user to a private session',
      parameters: {
        type: 'params',
        required: ['sessionId', 'recipientDid'],
        properties: {
          sessionId: { type: 'string' },
          recipientDid: { type: 'string' },
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
  },
};

export const createSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privateSession.create',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a new private session',
      parameters: {
        type: 'params',
        required: ['sessionKeys'],
        properties: {
          expirationHours: { type: 'integer' },
          sessionKeys: {
            type: 'array',
            items: {
              type: 'object',
              required: ['publicKey', 'recipientDid'],
              properties: {
                recipientDid: {
                  type: 'string',
                  description: 'A recipient for the session',
                },
                encryptedDek: {
                  type: 'string',
                  description:
                    'The session key encrypted with the recipients public key',
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
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' },
          },
        },
      },
    },
  },
};
