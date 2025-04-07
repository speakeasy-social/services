/**
 * XRPC method definitions for trust management
 */

import { TrustService } from '../services/trust.service.js';
import { XRPCHandlerConfig, XRPCReqContext, HandlerOutput } from '@atproto/xrpc-server';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceError, ValidationError, AuthorizationError, authorize, verifyAuth } from '@speakeasy-services/common';
import { lexicons } from '../lexicon/index.js';
import { getTrustsDef, addTrustedDef, removeTrustedDef } from '../lexicon/types/trust.js';

const trustService = new TrustService();

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
  'social.spkeasy.graph.getTrusts': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Validate input against lexicon
    validateAgainstLexicon(getTrustsDef, { did });
    // Anyone can see who trusts a DID
    const result = await trustService.getTrustedBy(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.graph.addTrusted': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Validate input against lexicon
    validateAgainstLexicon(addTrustedDef, { did });
    // Only the author can add trusted users
    authorize(ctx.req, 'create', { authorDid: ctx.req.user.did });
    const result = await trustService.addTrusted(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
  'social.spkeasy.graph.removeTrusted': async (ctx: XRPCReqContext): Promise<HandlerOutput> => {
    const { did } = ctx.params as { did: string };
    // Validate input against lexicon
    validateAgainstLexicon(removeTrustedDef, { did });
    // Only the author can remove trusted users
    authorize(ctx.req, 'delete', { authorDid: ctx.req.user.did });
    const result = await trustService.removeTrusted(did);
    return {
      encoding: 'application/json',
      body: result
    };
  },
} as const;

type MethodName = keyof typeof methodHandlers;

// Define methods using XRPC lexicon
export const methods: Record<MethodName, XRPCHandlerConfig> = {
  'social.spkeasy.graph.getTrusts': {
    handler: methodHandlers['social.spkeasy.graph.getTrusts']
  },
  'social.spkeasy.graph.addTrusted': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.graph.addTrusted']
  },
  'social.spkeasy.graph.removeTrusted': {
    auth: verifyAuth,
    handler: methodHandlers['social.spkeasy.graph.removeTrusted']
  },
};

// Register routes with Fastify
export const registerRoutes = async (fastify: FastifyInstance) => {
  // Register each method
  for (const [name, config] of Object.entries(methods)) {
    if (name in methodHandlers) {
      const methodName = name as MethodName;
      const handler = methodHandlers[methodName];
      fastify.route({
        method: 'POST',
        url: `/xrpc/${name}`,
        handler: async (request: any, reply: any) => {
          try {
            const result = await handler(request as unknown as XRPCReqContext);
            reply.send(result);
          } catch (error) {
            if (error instanceof ServiceError) {
              reply.status(error.statusCode).send({ error: error.message });
            } else {
              reply.status(500).send({ error: 'Internal server error' });
            }
          }
        }
      });
    }
  }
};
