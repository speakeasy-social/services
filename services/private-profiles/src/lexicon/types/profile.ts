import { LexiconDoc } from '@atproto/lexicon';

export const getProfileDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.getProfile',
  defs: {
    main: {
      type: 'query',
      description: 'Returns encrypted private profile for a user',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: { type: 'string', description: 'DID of the profile owner' },
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

export const getProfilesDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.getProfiles',
  defs: {
    main: {
      type: 'query',
      description: 'Returns encrypted private profiles for multiple users',
      parameters: {
        type: 'params',
        required: ['dids'],
        properties: {
          dids: {
            type: 'array',
            items: { type: 'string' },
            description: 'DIDs of the profile owners',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['profiles'],
          properties: {
            profiles: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'social.spkeasy.actor.profileView#profileView',
              },
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
      required: ['did', 'encryptedContent', 'encryptedDek', 'userKeyPairId'],
      properties: {
        did: { type: 'string', description: 'DID of the profile owner' },
        encryptedContent: { type: 'string', description: 'Base64-encoded encrypted profile content' },
        encryptedDek: { type: 'string', description: 'Base64-encoded encrypted DEK for the viewer' },
        userKeyPairId: { type: 'string', description: 'ID of the key pair used to encrypt the DEK' },
        avatarUri: { type: 'string' },
        bannerUri: { type: 'string' },
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
