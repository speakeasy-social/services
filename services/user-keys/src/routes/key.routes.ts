/**
 * XRPC endpoints for key management
 */

import { z } from 'zod';
import { KeyServiceImpl } from '../services/key.service.js';
import { ServiceError, ValidationError, AuthorizationError, DatabaseError, NotFoundError } from '@speakeasy-services/common';
import { XRPCHandlerConfig, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { authorize, verifyAuth } from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';
import { getPublicKeyDef, getPrivateKeyDef, rotateKeyDef } from '../lexicon/types/key.js';

const keyService = new KeyServiceImpl();

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
  'social.spkeasy.keys.getPublicKey': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    
    try {
      // Validate input against lexicon
      validateAgainstLexicon(getPublicKeyDef, { did });

      // Public key is publicly accessible
      const result = await keyService.getPublicKey(did);
      if (!result) {
        throw new NotFoundError('Public key not found');
      }

      return {
        encoding: 'application/json',
        body: result
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError('Failed to get public key');
    }
  },

  // Private key operations
  'social.spkeasy.keys.getPrivateKey': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    try {
      // Validate input against lexicon
      validateAgainstLexicon(getPrivateKeyDef, {});

      // Only the owner can access their private key
      const key = await keyService.getPrivateKey();
      if (!key) {
        throw new NotFoundError('Private key not found');
      }

      authorize(ctx.req, 'read', key);

      return {
        encoding: 'application/json',
        body: key
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError('Failed to get private key');
    }
  },

  // Key rotation operations
  'social.spkeasy.keys.rotate': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    try {
      // Validate input against lexicon
      validateAgainstLexicon(rotateKeyDef, {});

      // Only the owner can rotate their keys
      const currentKey = await keyService.getPrivateKey();
      if (!currentKey) {
        throw new NotFoundError('Current key not found');
      }

      authorize(ctx.req, 'manage', currentKey);

      const result = await keyService.requestRotation();
      return {
        encoding: 'application/json',
        body: result
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new DatabaseError('Failed to rotate keys');
    }
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  'social.spkeasy.keys.getPublicKey': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.getPublicKey']
  },
  'social.spkeasy.keys.getPrivateKey': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.getPrivateKey']
  },
  'social.spkeasy.keys.rotate': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.keys.rotate']
  }
};
