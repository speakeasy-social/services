import { LexiconDoc } from '@atproto/lexicon';

export const getFeaturesDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.getFeatures',
  defs: {
    main: {
      type: 'query',
      description: 'Get features for a given DID',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: {
            type: 'string',
            description: 'The DID to get features for',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'ref',
          ref: '#featureList',
        },
      },
    },
    featureList: {
      type: 'object',
      required: ['features'],
      properties: {
        features: {
          type: 'array',
          items: {
            type: 'ref',
            ref: '#feature',
          },
        },
      },
    },
    feature: {
      type: 'object',
      required: ['did', 'key', 'value'],
      properties: {
        did: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
      },
    },
  },
};

export const applyInviteCodeDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.applyInviteCode',
  defs: {
    main: {
      type: 'procedure',
      description: 'Apply an invite code to enable a feature',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['code'],
          properties: {
            code: {
              type: 'string',
              description: 'The invite code to apply',
            },
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

export const generateInviteCodeDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.generateInviteCode',
  defs: {
    main: {
      type: 'procedure',
      description: 'Generate a new invite code for the private-posts feature',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          properties: {},
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['code', 'remainingUses'],
          properties: {
            code: { type: 'string' },
            remainingUses: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const listInviteCodesDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.listInviteCodes',
  defs: {
    main: {
      type: 'query',
      description: 'List all invite codes created by the authenticated user',
      parameters: {
        type: 'params',
        properties: {},
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['inviteCodes'],
          properties: {
            inviteCodes: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#inviteCode',
              },
            },
          },
        },
      },
    },
    inviteCode: {
      type: 'object',
      required: ['code', 'remainingUses', 'totalUses', 'createdAt'],
      properties: {
        code: { type: 'string' },
        remainingUses: { type: 'integer' },
        totalUses: { type: 'integer' },
        createdAt: { type: 'string', format: 'datetime' },
      },
    },
  },
};

export const donateDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.actor.donate',
  defs: {
    main: {
      type: 'procedure',
      description: 'Prepare payment details for a Stripe checkout as either one-time payment or subscription',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['unitAmount', 'mode', 'currency'],
          properties: {
            unitAmount: {
              type: 'integer',
              description: 'A positive integer in cents (or 0 for a free price) representing how much to charge.',
            },
            mode: {
              type: 'string',
              description: "Must be either 'payment' or 'subscription'",
            },
            currency: {
              type: 'string',
              description: 'Three-letter ISO currency code (e.g., USD, NZD, EUR)',
            },
            donorEmail: {
              type: 'string',
              description: 'Optional email address of the donor for receipt delivery',
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['status', 'clientSecret'],
          properties: {
            status: { type: 'string' },
            clientSecret: { type: 'string' },
          },
        },
      },
    },
  },
};
