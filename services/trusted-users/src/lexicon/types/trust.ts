import { LexiconDoc } from '@atproto/lexicon';

export const trustedUserDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.trustedUser',
  defs: {
    main: {
      type: 'object',
      required: ['recipientDid', 'createdAt'],
      properties: {
        recipientDid: { type: 'string' },
        createdAt: { type: 'string', format: 'datetime' },
      },
    },
  },
};

export const getTrustedDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.getTrusted',
  defs: {
    main: {
      type: 'query',
      description: 'Get all users trusted by a given DID',
      parameters: {
        type: 'params',
        required: ['authorDid'],
        properties: {
          authorDid: { type: 'string' },
          recipientDid: { type: 'string' },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['trusted'],
          properties: {
            trusted: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#trustedUser',
              },
            },
          },
        },
      },
    },
  },
};

export const addTrustedDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.addTrusted',
  defs: {
    main: {
      type: 'procedure',
      description: 'Add a user to the trusted users list',
      parameters: {
        type: 'params',
        required: ['recipientDid'],
        properties: {
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

export const removeTrustedDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.graph.removeTrusted',
  defs: {
    main: {
      type: 'procedure',
      description: 'Remove a user from the trusted users list',
      parameters: {
        type: 'params',
        required: ['recipientDid'],
        properties: {
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
