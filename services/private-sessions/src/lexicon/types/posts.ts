import { LexiconDoc } from '@atproto/lexicon';

export const privatePostsDefs = {
  getPosts: {
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
            limit: { type: 'integer', maximum: 100, default: 50 },
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
      },
      privatePost: {
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
  },
  get_bulk: {
    lexicon: 1,
    id: 'social.spkeasy.privatePosts.get_bulk',
    defs: {
      main: {
        type: 'query',
        description: 'Get multiple private posts by their IDs',
        parameters: {
          type: 'params',
          required: ['postIds'],
          properties: {
            postIds: {
              type: 'array',
              items: { type: 'string' }
            }
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
              }
            }
          }
        }
      }
    }
  },
  createPost: {
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
  },
  deletePost: {
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
  }
} as const; 