/**
 * XRPC endpoints for key management
 */

import { KeyService } from '../services/key.service.js';
import { ValidationError, NotFoundError } from '@speakeasy-services/common';
import { HandlerOutput } from '@atproto/xrpc-server';
import { authorize } from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';
import {
  getPublicKeyDef,
  getPrivateKeyDef,
  rotateKeyDef,
  getPublicKeysDef,
} from '../lexicon/types/key.js';
import { RequestHandler, ExtendedRequest } from '@speakeasy-services/common';

const keyService = new KeyService();

// Helper function to validate against lexicon schema
function validateAgainstLexicon(lexicon: any, params: any) {
  const schema = lexicon.defs.main.parameters;
  if (!schema) return;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined) {
        throw new ValidationError(`${field} is required`);
      }
    }
  }

  // Check field types
  if (schema.properties) {
    for (const [field, def] of Object.entries(schema.properties)) {
      const value = params[field];
      if (value === undefined) continue;

      const type = (def as any).type;
      if (type === 'string' && typeof value !== 'string') {
        throw new ValidationError(`${field} must be a string`);
      } else if (type === 'number' && typeof value !== 'number') {
        throw new ValidationError(`${field} must be a number`);
      } else if (type === 'boolean' && typeof value !== 'boolean') {
        throw new ValidationError(`${field} must be a boolean`);
      } else if (type === 'array' && !Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
      }
    }
  }
}

// Define method handlers
const methodHandlers = {
  /**
   * Get a user's public key by their DID
   */
  'social.spkeasy.keys.getPublicKey': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(getPublicKeyDef, req.query);

    const { did } = req.query as { did: string };

    // Public key is publicly accessible
    const key = await keyService.getUserKey(did);
    if (!key) {
      throw new NotFoundError('Public key not found');
    }

    return {
      encoding: 'application/json',
      body: {
        publicKey: key.publicKey,
        authorDid: key.authorDid,
      },
    };
  },

  /**
   * Get a user's public key by their DID
   */
  'social.spkeasy.keys.getPublicKeys': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(getPublicKeysDef, req.query);

    const dids = req.query.dids.split(',');

    // Public key is publicly accessible
    const keys = await keyService.getUserKeys(dids);

    return {
      encoding: 'application/json',
      body: {
        publicKeys: keys.map((key) => ({
          publicKey: key.publicKey,
          authorDid: key.authorDid,
        })),
      },
    };
  },

  /**
   * Get the authenticated user's private key
   */
  'social.spkeasy.keys.getPrivateKey': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(getPrivateKeyDef, {});

    authorize(req, 'get_private_key', 'key', { authorDid: req.user.did });

    // Only the owner can access their private key
    const key = await keyService.getUserKey(req.user.did!);
    if (!key) {
      throw new NotFoundError('Private key not found');
    }

    authorize(req, 'get_private_key', 'key', key);

    return {
      encoding: 'application/json',
      body: {
        // FIXME use view pattern
        publicKey: key.privateKey,
        authorDid: key.authorDid,
      },
    };
  },

  /**
   * Rotate a user's key pair with new public/private keys
   */
  'social.spkeasy.keys.rotate': async (
    req: ExtendedRequest,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(rotateKeyDef, req.body);

    const { privateKey, publicKey } = req.body;

    authorize(req, 'update', 'key', { authorDid: req.user.did });

    const result = await keyService.requestRotation(
      req.user.did!,
      privateKey,
      publicKey,
    );
    return {
      encoding: 'application/json',
      body: result,
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.keys.getPublicKey': {
    handler: methodHandlers['social.spkeasy.keys.getPublicKey'],
  },
  'social.spkeasy.keys.getPublicKeys': {
    handler: methodHandlers['social.spkeasy.keys.getPublicKeys'],
  },
  'social.spkeasy.keys.getPrivateKey': {
    handler: methodHandlers['social.spkeasy.keys.getPrivateKey'],
  },
  'social.spkeasy.keys.rotate': {
    handler: methodHandlers['social.spkeasy.keys.rotate'],
  },
};
