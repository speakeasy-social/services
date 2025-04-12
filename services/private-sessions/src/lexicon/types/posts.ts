import { LexiconDoc } from '@atproto/lexicon';

export const getPostsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePosts.getPosts',
  defs: {
    main: {
      type: 'query',
      description: 'Get private posts for specified authors',
      parameters: {
        type: 'params',
        required: ['authors'],
        properties: {
          authors: {
            type: 'string',
            description: 'Comma-separated list of author DIDs',
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
                ref: '#privatePost',
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
  id: 'social.spkeasy.privatePosts.createPosts',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a new private post',
      parameters: {
        type: 'params',
        required: ['encryptedPosts', 'sessionId'],
        properties: {
          encryptedPosts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['cid', 'langs', 'encryptedContent'],
              properties: {
                cid: { type: 'string' },
                reply: {
                  type: 'object',
                  properties: {
                    root: { type: 'string' },
                    parent: { type: 'string' },
                  },
                },
                langs: {
                  type: 'array',
                  items: { type: 'string' },
                },
                encryptedContent: { type: 'string' },
              },
            },
          },
          sessionId: {
            type: 'array',
            items: { type: 'string' },
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
  },
};

export const deletePostDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePosts.deletePost',
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

export const privatePostDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePosts.privatePost',
  defs: {
    main: {
      type: 'object',
      required: ['uri', 'authorDid', 'text', 'createdAt'],
      properties: {
        uri: { type: 'string' },
        authorDid: { type: 'string' },
        text: { type: 'string' },
        createdAt: { type: 'string', format: 'datetime' },
        reply: {
          type: 'object',
          properties: {
            root: { type: 'string' },
            parent: { type: 'string' },
          },
        },
      },
    },
  },
};
