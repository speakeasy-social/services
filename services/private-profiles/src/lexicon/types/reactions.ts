import { LexiconDoc } from '@atproto/lexicon';

export const createReactionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.reaction.createReaction',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a reaction (like) for a post',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['uri'],
          properties: {
            uri: {
              type: 'string',
              description: 'The URI of the post to react to',
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

export const deleteReactionDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.reaction.deleteReaction',
  defs: {
    main: {
      type: 'procedure',
      description: 'Delete a reaction (like) for a post',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['uri'],
          properties: {
            uri: {
              type: 'string',
              description: 'The URI of the post to remove reaction from',
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
