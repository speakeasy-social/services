import { LexiconDoc } from '@atproto/lexicon';

export const getPublicKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPublicKey',
  defs: {
    main: {
      type: 'query',
      description: "Get a user's public key",
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          did: {
            type: 'string',
            description: 'The DID of the user whose public key to retrieve',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['publicKey', 'authorDid'],
          properties: {
            publicKey: {
              type: 'string',
              description: "The user's public key in base64 format",
            },
            authorDid: {
              type: 'string',
              description: 'The DID of the key owner',
            },
          },
        },
      },
    },
  },
};

export const getPublicKeysDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPublicKeys',
  defs: {
    main: {
      type: 'query',
      description: "Get multiple users' public keys",
      parameters: {
        type: 'params',
        required: ['dids'],
        properties: {
          dids: {
            type: 'string',
            description:
              'Comma-separated list of DIDs whose public keys to retrieve',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['publicKeys'],
          properties: {
            publicKeys: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'publicKey',
              },
            },
          },
        },
      },
    },
    publicKey: {
      type: 'object',
      required: ['publicKey', 'recipientDid'],
      properties: {
        publicKey: {
          type: 'string',
          description: "The user's public key in base64 format",
        },
        authorDid: {
          type: 'string',
          description: 'The DID of the key owner',
        },
      },
    },
  },
};

export const getPrivateKeysDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPrivateKey',
  defs: {
    main: {
      type: 'query',
      description: "Get a user's private key",
      parameters: {
        type: 'params',
        required: ['did'],
        properties: {
          ids: {
            type: 'array',
            description:
              'Comma-separated list of user key pair IDs whose private keys to retrieve',
            items: {
              type: 'string',
            },
          },
          did: {
            type: 'string',
            description: 'The DID of the user whose private keys to retrieve',
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['publicKey', 'privateKey', 'authorDid'],
          properties: {
            publicKey: {
              type: 'string',
              description: "The user's public key in base64 format",
            },
            privateKey: {
              type: 'string',
              description: "The user's private key in base64 format",
            },
            authorDid: {
              type: 'string',
              description: 'The DID of the key owner',
            },
          },
        },
      },
    },
  },
};

export const getPrivateKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.getPrivateKey',
  defs: {
    main: {
      type: 'query',
      description: "Get a user's private key",
      parameters: {
        type: 'params',
        properties: {},
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['publicKey', 'privateKey', 'authorDid'],
          properties: {
            publicKey: {
              type: 'string',
              description: "The user's public key in base64 format",
            },
            privateKey: {
              type: 'string',
              description: "The user's private key in base64 format",
            },
            authorDid: {
              type: 'string',
              description: 'The DID of the key owner',
            },
          },
        },
      },
    },
  },
};

export const rotateKeyDef: LexiconDoc = {
  lexicon: 1,
  id: 'social.spkeasy.keys.rotate',
  defs: {
    main: {
      type: 'procedure',
      description: 'Request a key rotation',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['privateKey', 'publicKey'],
          properties: {
            privateKey: {
              type: 'string',
              description: 'The new private key in base64 format',
            },
            publicKey: {
              type: 'string',
              description: 'The new public key in base64 format',
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['success'],
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the key rotation request was successful',
            },
          },
        },
      },
    },
  },
};
