import { LexiconDoc } from '@atproto/lexicon';

export const getPublicKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPublicKey',
  defs: {
    main: {
      type: 'query',
      description: 'Get a user\'s public key',
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: { 
            type: 'string',
            description: 'The DID of the user whose public key to retrieve'
          }
        }
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['publicKey'],
          properties: {
            publicKey: { 
              type: 'string',
              description: 'The user\'s public key in base64 format'
            }
          }
        }
      }
    }
  }
};

export const getPrivateKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPrivateKey',
  defs: {
    main: {
      type: 'query',
      description: 'Get a user\'s private key',
      parameters: {
        type: 'params',
        properties: {}
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['privateKey'],
          properties: {
            privateKey: { 
              type: 'string',
              description: 'The user\'s private key in base64 format'
            }
          }
        }
      }
    }
  }
};

export const rotateKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.rotate',
  defs: {
    main: {
      type: 'procedure',
      description: 'Request a key rotation',
      parameters: {
        type: 'params',
        properties: {}
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { 
              type: 'boolean',
              description: 'Whether the key rotation request was successful'
            }
          }
        }
      }
    }
  }
};

export const keyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.key',
  defs: {
    main: {
      type: 'object',
      required: ['publicKey', 'privateKey', 'createdAt'],
      properties: {
        publicKey: { 
          type: 'string',
          description: 'The public key in base64 format'
        },
        privateKey: { 
          type: 'string',
          description: 'The private key in base64 format'
        },
        createdAt: { 
          type: 'string',
          format: 'datetime',
          description: 'When the key was created'
        }
      }
    }
  }
}; 