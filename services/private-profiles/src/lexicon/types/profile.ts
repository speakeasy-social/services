import { LexiconDoc } from '@atproto/lexicon';

export const getProfileDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.getProfile',
  defs: {
    main: {
      type: 'query',
      description: 'Returns encrypted private profile',
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['profile'],
          properties: {
            profile: {
              type: 'ref',
              ref: 'social.spkeasy.actor.profileView#profileView',
            },
          },
        },
      },
    },
  },
};

export const profileViewDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.profileView',
  defs: {
    main: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        sessionId: { type: 'string' },
        authorDid: { type: 'string' },
        encryptedContent: { type: 'string' },
        avatarUri: { type: 'string' },
        bannerUri: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  },
};

export const putProfileDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.putProfile',
  defs: {
    main: {
      type: 'procedure',
      description: 'Update encrypted private profile',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['sessionId', 'encryptedContent'],
          properties: {
            sessionId: { type: 'string' },
            encryptedContent: { type: 'string' },
            avatarUri: { type: 'string' },
            bannerUri: { type: 'string' },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['profile'],
          properties: {
            profile: {
              type: 'ref',
              ref: 'social.spkeasy.actor.profileView#profileView',
            },
          },
        },
      },
    },
  },
};

export const deleteProfileDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.deleteProfile',
  defs: {
    main: {
      type: 'procedure',
      description: 'Delete encrypted private profile',
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
