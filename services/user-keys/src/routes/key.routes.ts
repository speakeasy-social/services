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
} from '../lexicon/types/key.js';
import { Request, Response, RequestHandler } from 'express';

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
  // Public key operations
  'social.spkeasy.keys.getPublicKey': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const { did } = req.query as { did: string };

    // Validate input against lexicon
    validateAgainstLexicon(getPublicKeyDef, { did });

    // Public key is publicly accessible
    const key = await keyService.getUserKey(did);
    if (!key) {
      throw new NotFoundError('Public key not found');
    }

    authorize(req, 'get_public_key', key);

    return {
      encoding: 'application/json',
      body: {
        publicKey: key.publicKey,
        authorDid: key.authorDid,
      },
    };
  },

  // Private key operations
  'social.spkeasy.keys.getPrivateKey': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    const { did } = req.query as { did: string };

    // Validate input against lexicon
    validateAgainstLexicon(getPrivateKeyDef, {});

    // Only the owner can access their private key
    const key = await keyService.getUserKey(did);
    if (!key) {
      throw new NotFoundError('Private key not found');
    }

    authorize(ctx.req, 'get_private_key', key);

    return {
      encoding: 'application/json',
      body: key,
    };
  },

  // Key rotation operations
  'social.spkeasy.keys.rotate': async (
    req: Request,
  ): Promise<HandlerOutput> => {
    // Validate input against lexicon
    validateAgainstLexicon(rotateKeyDef, {});

    authorize(req, 'update', currentKey);

    const result = await keyService.requestRotation();
    return {
      encoding: 'application/json',
      body: result,
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, { handler: RequestHandler }> = {
  'social.spkeasy.keys.getPublicKey': {
    handler: methodHandlers['social.spkeasy.keys.getPublicKey'],
  },
  'social.spkeasy.keys.getPrivateKey': {
    handler: methodHandlers['social.spkeasy.keys.getPrivateKey'],
  },
  'social.spkeasy.keys.rotate': {
    handler: methodHandlers['social.spkeasy.keys.rotate'],
  },
};
