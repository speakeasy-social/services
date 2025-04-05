import { LexiconDoc } from '@atproto/lexicon';

export const privateSessionDefs = {
  revoke: {
    lexicon: 1,
    id: 'social.spkeasy.privateSession.revoke',
    defs: {
      main: {
        type: 'procedure',
        description: 'Revoke a private session',
        parameters: {
          type: 'params',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' }
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
  },
  addUser: {
    lexicon: 1,
    id: 'social.spkeasy.privateSession.addUser',
    defs: {
      main: {
        type: 'procedure',
        description: 'Add a user to a private session',
        parameters: {
          type: 'params',
          required: ['sessionId', 'did'],
          properties: {
            sessionId: { type: 'string' },
            did: { type: 'string' }
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