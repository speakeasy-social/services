import { LexiconDoc } from '@atproto/lexicon';

export const createProfileSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.create',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a new profile session',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['sessionKeys'],
          properties: {
            expirationHours: { type: 'integer' },
            sessionKeys: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'social.spkeasy.profileSession.sessionKey#sessionKey',
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
    sessionKey: {
      type: 'object',
      properties: {
        recipientDid: { type: 'string' },
        userKeyPairId: { type: 'string' },
        encryptedDek: { type: 'string' },
      },
    },
  },
};

export const revokeProfileSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.revoke',
  defs: {
    main: {
      type: 'procedure',
      description: 'Revoke an existing profile session',
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
  },
};

export const addUserToProfileSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.addUser',
  defs: {
    main: {
      type: 'procedure',
      description: 'Add a new recipient to an existing profile session',
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
  },
};

export const getProfileSessionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.getSession',
  defs: {
    main: {
      type: 'query',
      description:
        'Retrieve the current profile session key for the authenticated user',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['encryptedSessionKey'],
          properties: {
            encryptedSessionKey: {
              type: 'ref',
              ref: 'social.spkeasy.profileSession.sessionKeyView#sessionKeyView',
            },
          },
        },
      },
    },
  },
};

export const sessionKeyViewDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.sessionKeyView',
  defs: {
    main: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        encryptedDek: { type: 'string' },
        recipientDid: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  },
};

export const updateProfileSessionKeysDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.profileSession.updateKeys',
  defs: {
    main: {
      type: 'procedure',
      description: 'Update session keys for a batch of profile sessions',
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
  },
};
