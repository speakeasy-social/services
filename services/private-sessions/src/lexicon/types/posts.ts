import { LexiconDoc } from '@atproto/lexicon';

export const getPostsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePost.getPosts',
  defs: {
    main: {
      type: 'query',
      description: 'Get private posts for specified authors',
      parameters: {
        type: 'params',
        required: [],
        properties: {
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of author DIDs',
          },
          uris: {
            type: 'array',
            items: { type: 'string' },
            description: 'URIs of exact posts to retrieve',
          },
          replyTo: {
            type: 'string',
            description: 'Optional URI of the post being replied to',
          },
          limit: {
            type: 'string',
            description: 'Optional limit for pagination',
          },
          cursor: {
            type: 'string',
            description: 'Optional cursor for pagination',
          },
          filter: {
            type: 'string',
            description:
              'Set to "follows" to only get posts from people you follow',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['encryptedPosts', 'encryptedSessionKeys'],
          properties: {
            cursor: { type: 'string' },
            encryptedPosts: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#encryptedPost',
              },
            },
            encryptedSessionKeys: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export const createPostsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePost.createPosts',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a new private post',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['encryptedPosts', 'sessionId'],
          properties: {
            encryptedPosts: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#encryptedPost',
              },
            },
            sessionId: {
              type: 'string',
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['uri'],
          properties: {
            uri: { type: 'string' },
          },
        },
      },
    },
    encryptedPost: {
      type: 'object',
      required: ['rkey', 'langs', 'encryptedContent'],
      properties: {
        rkey: { type: 'string' },
        reply: {
          type: 'ref',
          ref: '#reply',
        },
        langs: {
          type: 'array',
          items: { type: 'string' },
        },
        encryptedContent: { type: 'string' },
      },
    },
    reply: {
      type: 'object',
      properties: {
        root: { type: 'ref', ref: '#recordRef' },
        parent: { type: 'ref', ref: '#recordRef' },
      },
    },
    recordRef: {
      type: 'object',
      properties: {
        uri: { type: 'string' },
      },
    },
  },
};

export const deletePostDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePost.deletePost',
  defs: {
    main: {
      type: 'procedure',
      description: 'Delete a private post',
      parameters: {
        type: 'params',
        required: ['uri'],
        properties: {
          uri: { type: 'string' },
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
