import { LexiconDoc } from '@atproto/lexicon';

export const getPostsDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePosts.getPosts',
  defs: {
    main: {
      type: 'query',
      description: 'Get private posts for a recipient',
      parameters: {
        type: 'params',
        required: ['recipient'],
        properties: {
          recipient: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          cursor: { type: 'string' }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['posts'],
          properties: {
            posts: {
              type: 'array',
              items: {
                type: 'ref',
                ref: '#privatePost'
              }
            },
            cursor: { type: 'string' }
          }
        }
      }
    }
  }
};

export const createPostDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.privatePosts.createPost',
  defs: {
    main: {
      type: 'procedure',
      description: 'Create a new private post',
      parameters: {
        type: 'params',
        required: ['sessionId', 'text', 'recipients'],
        properties: {
          sessionId: { type: 'string' },
          text: { type: 'string' },
          recipients: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['uri'],
          properties: {
            uri: { type: 'string' }
          }
        }
      }
    }
  }
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
          uri: { type: 'string' }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }
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
        createdAt: { type: 'string', format: 'datetime' }
      }
    }
  }
}; 