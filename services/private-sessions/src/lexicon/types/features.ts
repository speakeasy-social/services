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
